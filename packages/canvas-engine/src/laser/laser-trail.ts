/**
 * Laser strokes: pointer gestures that stay while you are using them, then
 * leave on their own shortly after you stop.
 *
 * Nothing here is a shape. A laser is a gesture — the drawn equivalent of
 * pointing at something while you talk — so it never enters the document, takes
 * no undo slot, and is gone within a couple of seconds. Everything else follows
 * from the trail being allowed to disappear: no id, no z-order, no persistence,
 * no validation on the way in.
 *
 * The lifecycle is what makes it read as pointing rather than as ink. A stroke
 * is on no clock at all while it is being drawn, and neither are the strokes
 * before it: circle a thing, release, underline another, release, and both are
 * still whole. The countdown starts only once the hand stops, and when it fires
 * the group erases together from the start of the first stroke. So an
 * annotation built out of five gestures has one lifetime, not five — it is a
 * single thing you put up and a single thing that comes down.
 *
 * Points are held in **world** coordinates, matching presence cursors, because
 * collaborators sit at different zoom and pan. Two people looking at the same
 * rectangle must see the trail over that rectangle, not over the same screen
 * pixel.
 */

/**
 * How long a finished group stays whole before it begins to go, in
 * milliseconds.
 *
 * Long enough to finish a sentence about what you just circled, short enough
 * that the board is never littered with someone's last three gestures.
 */
export const LASER_HOLD_TIME = 1200;

/** How long the group then takes to erase itself, in milliseconds. */
export const LASER_FADE_TIME = 500;

/** Stroke width in screen pixels. Divided by zoom at draw time. */
export const LASER_WIDTH = 4;

/**
 * How far each sample moves toward the raw pointer position, 0–1.
 *
 * A raw pointer stream is jittery, and drawn as straight segments it reads as a
 * jagged polyline rather than a beam. Easing each sample toward the last drawn
 * point costs nothing and is the difference between "line" and "laser". Lower
 * values are smoother but lag the cursor.
 */
const SMOOTHING = 0.73;

/**
 * Samples closer together than this, in world units, are dropped.
 *
 * A stroke is now kept in full for as long as the gesture lasts, so there is no
 * decay to bound the buffer. A pointer held still against a board that keeps
 * firing move events would otherwise grow the point array indefinitely without
 * changing the picture by a pixel.
 */
const MIN_SAMPLE_DISTANCE = 1;

interface TrailPoint {
  readonly x: number;
  readonly y: number;
}

/** One press–drag–release. */
export class LaserStroke {
  private points: TrailPoint[] = [];
  /**
   * The last position handed in, before smoothing.
   *
   * Kept apart from the drawn points because the spacing test has to be made
   * against where the pointer actually was. Comparing against the smoothed head
   * would measure the trail's own lag and reject real movement.
   */
  private lastSample: TrailPoint | null = null;

  /** Extend the stroke. False if the sample was too close to the last one. */
  addPoint(x: number, y: number): boolean {
    const sample = this.lastSample;
    if (sample) {
      const dx = x - sample.x;
      const dy = y - sample.y;
      if (dx * dx + dy * dy < MIN_SAMPLE_DISTANCE * MIN_SAMPLE_DISTANCE) return false;
    }
    this.lastSample = { x, y };

    const head = this.points[this.points.length - 1];
    if (!head) {
      this.points.push({ x, y });
      return true;
    }

    this.points.push({
      x: head.x + (x - head.x) * SMOOTHING,
      y: head.y + (y - head.y) * SMOOTHING,
    });
    return true;
  }

  /** The points still to be drawn, oldest first. */
  livePoints(): readonly TrailPoint[] {
    return this.points;
  }

  pointCount(): number {
    return this.points.length;
  }

  isEmpty(): boolean {
    return this.points.length === 0;
  }

  /** Rub out up to `count` of the oldest points. Returns how many went. */
  eraseFromStart(count: number): number {
    const taken = Math.max(0, Math.min(count, this.points.length));
    if (taken > 0) this.points.splice(0, taken);
    return taken;
  }
}

/**
 * One group of strokes sharing a single lifetime.
 *
 * A group stays open across releases, so consecutive gestures land in the same
 * one and expire together. It closes only by falling silent for
 * {@link LASER_HOLD_TIME}, after which nothing may join it — a stroke begun
 * during the fade starts a fresh group rather than reviving a group already
 * halfway off the board.
 */
class LaserSession {
  private strokes: LaserStroke[] = [];
  private current: LaserStroke | null = null;
  private lastActivity: number;
  /**
   * How many points the group held when its fade began, fixed at that moment.
   *
   * The erase is expressed as a fraction of this rather than as a per-frame
   * step, so it is driven purely by the clock: dropped frames, a slow tab and a
   * repeated call all land on the same picture.
   */
  private fadeTotal = 0;

  constructor(now: number) {
    this.lastActivity = now;
  }

  begin(x: number, y: number, now: number): void {
    // A begin while a stroke is still open means a lost pointerup. The
    // abandoned stroke stays in the group and lives out the group's lifetime,
    // rather than being cut off or joined to the new one by a line across the
    // board.
    this.current = new LaserStroke();
    this.current.addPoint(x, y);
    this.strokes.push(this.current);
    this.lastActivity = now;
  }

  /** Add to the open stroke. False when there is none, or the sample repeats. */
  extend(x: number, y: number, now: number): boolean {
    if (!this.current?.addPoint(x, y)) return false;
    this.lastActivity = now;
    return true;
  }

  end(now: number): void {
    this.current = null;
    this.lastActivity = now;
  }

  isDrawing(): boolean {
    return this.current !== null;
  }

  /** Whether a new stroke may still join, rather than starting a new group. */
  accepts(now: number): boolean {
    return this.current !== null || now - this.lastActivity < LASER_HOLD_TIME;
  }

  isEmpty(): boolean {
    return this.strokes.length === 0;
  }

  /** Apply whatever erasure the clock calls for, and report what is left. */
  strokesAt(now: number): readonly LaserStroke[] {
    // An open stroke holds the whole group up, including the strokes drawn
    // before it. This is the rule that lets an annotation be built at any pace
    // and still leave in one piece.
    if (this.current) return this.strokes;

    const idle = now - this.lastActivity;
    if (idle < LASER_HOLD_TIME) return this.strokes;

    const remaining = this.pointCount();
    if (remaining === 0) return this.strokes;
    if (this.fadeTotal === 0) this.fadeTotal = remaining;

    const progress = (idle - LASER_HOLD_TIME) / LASER_FADE_TIME;
    if (progress >= 1) {
      this.strokes = [];
      return this.strokes;
    }

    // Squared, so the group sits still for a beat longer and then leaves
    // quickly. A linear erase reads as a slow wipe; this reads as letting go.
    const target = Math.floor(progress * progress * this.fadeTotal);
    this.erase(target - (this.fadeTotal - remaining));

    return this.strokes;
  }

  private pointCount(): number {
    let total = 0;
    for (const stroke of this.strokes) total += stroke.pointCount();
    return total;
  }

  /** Rub out `count` points, oldest first, walking strokes in drawing order. */
  private erase(count: number): void {
    let left = count;
    for (const stroke of this.strokes) {
      if (left <= 0) break;
      left -= stroke.eraseFromStart(left);
    }
    // Erasure runs strictly front to back, so only leading strokes can be
    // spent — and dropping them is what leaves the group empty at the end.
    let spent = 0;
    while (spent < this.strokes.length && this.strokes[spent]!.isEmpty()) spent++;
    if (spent > 0) this.strokes.splice(0, spent);
  }
}

/**
 * Every laser stroke belonging to one author.
 *
 * Groups accumulate here rather than being replaced, because a stroke begun
 * while an older group is mid-fade must not disturb it: the old group finishes
 * leaving on its own schedule while the new one starts from full.
 */
export class LaserTrail {
  private sessions: LaserSession[] = [];

  begin(x: number, y: number, now: number): void {
    const open = this.sessions[this.sessions.length - 1];
    if (open?.accepts(now)) {
      open.begin(x, y, now);
      return;
    }

    const session = new LaserSession(now);
    session.begin(x, y, now);
    this.sessions.push(session);
  }

  /**
   * Extend the open stroke. False when nothing changed.
   *
   * A move with no button down lands here too, and must be inert — pointer
   * moves are what keep a group alive, so counting them would leave a trail up
   * for as long as the cursor kept wandering after the gesture ended.
   */
  extend(x: number, y: number, now: number): boolean {
    return this.drawing()?.extend(x, y, now) ?? false;
  }

  end(now: number): void {
    this.drawing()?.end(now);
  }

  isDrawing(): boolean {
    return this.drawing() !== null;
  }

  /** True when nothing is left to paint and this trail can be dropped. */
  isEmpty(): boolean {
    return this.sessions.length === 0;
  }

  /** Advance every group's fade, drop the spent ones, and return what to draw. */
  strokesAt(now: number): LaserStroke[] {
    const live: LaserStroke[] = [];
    let spent = false;

    for (const session of this.sessions) {
      for (const stroke of session.strokesAt(now)) live.push(stroke);
      if (session.isEmpty()) spent = true;
    }
    if (spent) this.sessions = this.sessions.filter((session) => !session.isEmpty());

    return live;
  }

  /** The group accepting strokes right now, if the pointer is down. */
  private drawing(): LaserSession | null {
    const open = this.sessions[this.sessions.length - 1];
    return open?.isDrawing() ? open : null;
  }
}
