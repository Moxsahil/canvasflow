/** An emoji, its name, and any other words it should be found by. */
export type EmojiEntry = readonly [char: string, name: string, also?: string];

export interface EmojiGroup {
  readonly id: string;
  readonly label: string;
  readonly emoji: readonly EmojiEntry[];
}

/**
 * The emoji the picker offers.
 *
 * A chosen few hundred rather than all of Unicode: what gets used in a comment
 * on a drawing, and nothing newer than every current system can draw. Anything
 * else can still be typed or pasted into a comment.
 */
export const EMOJI_GROUPS: readonly EmojiGroup[] = [
  {
    id: 'frequent',
    label: 'Often used',
    emoji: [
      ['👍', 'thumbs up', 'yes like approve agree +1'],
      ['❤️', 'red heart', 'love'],
      ['😂', 'tears of joy', 'laugh lol funny'],
      ['🎉', 'party popper', 'celebrate tada congratulations'],
      ['😮', 'surprised', 'wow open mouth'],
      ['😢', 'crying', 'sad tear'],
      ['🙏', 'folded hands', 'please thank you thanks'],
      ['🔥', 'fire', 'hot lit'],
      ['👀', 'eyes', 'look see watching'],
      ['✅', 'check mark', 'done yes complete'],
    ],
  },
  {
    id: 'smileys',
    label: 'Smileys',
    emoji: [
      ['😀', 'grinning'],
      ['😃', 'smiley', 'happy'],
      ['😄', 'smile', 'happy'],
      ['😁', 'beaming', 'grin'],
      ['😆', 'laughing'],
      ['😅', 'sweat smile', 'relief phew'],
      ['🤣', 'rolling on the floor laughing', 'rofl lol'],
      ['😂', 'tears of joy', 'laugh lol funny'],
      ['🙂', 'slight smile'],
      ['🙃', 'upside down', 'sarcasm'],
      ['😉', 'wink'],
      ['😊', 'blush', 'happy pleased'],
      ['😇', 'halo', 'angel innocent'],
      ['🥰', 'smiling with hearts', 'love adore'],
      ['😍', 'heart eyes', 'love'],
      ['🤩', 'star struck', 'wow amazing'],
      ['😘', 'blowing a kiss'],
      ['😋', 'yum', 'tasty delicious'],
      ['😛', 'tongue out'],
      ['😜', 'winking tongue', 'joke kidding'],
      ['🤪', 'zany', 'crazy silly'],
      ['🤔', 'thinking', 'hmm consider'],
      ['🤨', 'raised eyebrow', 'doubt sceptical'],
      ['😐', 'neutral'],
      ['😑', 'expressionless'],
      ['😶', 'no mouth', 'speechless quiet'],
      ['🙄', 'eye roll'],
      ['😏', 'smirk'],
      ['😬', 'grimace', 'awkward oops'],
      ['😌', 'relieved', 'calm'],
      ['😴', 'sleeping', 'zzz tired'],
      ['😷', 'mask', 'sick ill'],
      ['🤒', 'thermometer', 'sick ill fever'],
      ['🤯', 'mind blown', 'exploding head'],
      ['🥳', 'partying', 'celebrate birthday'],
      ['😎', 'sunglasses', 'cool'],
      ['🤓', 'nerd', 'glasses'],
      ['😕', 'confused'],
      ['😟', 'worried'],
      ['🙁', 'frown', 'sad'],
      ['😮', 'surprised', 'wow open mouth'],
      ['😲', 'astonished', 'shocked'],
      ['😳', 'flushed', 'embarrassed'],
      ['🥺', 'pleading', 'puppy eyes please'],
      ['😢', 'crying', 'sad tear'],
      ['😭', 'sobbing', 'cry sad'],
      ['😱', 'scream', 'fear shock'],
      ['😤', 'huffing', 'frustrated'],
      ['😡', 'angry', 'mad'],
      ['🤬', 'cursing', 'swearing angry'],
      ['😈', 'smiling devil', 'mischief'],
      ['💀', 'skull', 'dead'],
      ['🤡', 'clown'],
      ['👻', 'ghost'],
      ['🤖', 'robot', 'bot'],
    ],
  },
  {
    id: 'people',
    label: 'Hands and people',
    emoji: [
      ['👍', 'thumbs up', 'yes like approve agree +1'],
      ['👎', 'thumbs down', 'no dislike disagree -1'],
      ['👌', 'ok hand', 'perfect fine'],
      ['✌️', 'victory hand', 'peace'],
      ['🤞', 'fingers crossed', 'luck hope'],
      ['🤟', 'love you gesture'],
      ['🤘', 'rock on', 'horns'],
      ['👈', 'pointing left'],
      ['👉', 'pointing right'],
      ['👆', 'pointing up', 'above'],
      ['👇', 'pointing down', 'below'],
      ['✋', 'raised hand', 'stop high five'],
      ['👋', 'waving hand', 'hello hi bye'],
      ['👏', 'clapping', 'applause bravo'],
      ['🙌', 'raising hands', 'hooray yay'],
      ['🤝', 'handshake', 'deal agree'],
      ['🙏', 'folded hands', 'please thank you thanks'],
      ['💪', 'flexed biceps', 'strong muscle'],
      ['✍️', 'writing hand'],
      ['👀', 'eyes', 'look see watching'],
      ['🧠', 'brain', 'smart idea'],
      ['🤷', 'shrug', 'dunno unsure'],
      ['🤦', 'facepalm'],
    ],
  },
  {
    id: 'symbols',
    label: 'Hearts and signs',
    emoji: [
      ['❤️', 'red heart', 'love'],
      ['🧡', 'orange heart'],
      ['💛', 'yellow heart'],
      ['💚', 'green heart'],
      ['💙', 'blue heart'],
      ['💜', 'purple heart'],
      ['🖤', 'black heart'],
      ['🤍', 'white heart'],
      ['💔', 'broken heart'],
      ['💯', 'hundred points', 'perfect score'],
      ['✨', 'sparkles', 'new shiny'],
      ['⭐', 'star'],
      ['🌟', 'glowing star'],
      ['🔥', 'fire', 'hot lit'],
      ['💥', 'collision', 'boom bang'],
      ['💡', 'light bulb', 'idea'],
      ['✅', 'check mark', 'done yes complete'],
      ['❌', 'cross mark', 'no wrong'],
      ['⚠️', 'warning', 'caution'],
      ['❓', 'question mark'],
      ['❗', 'exclamation mark', 'important'],
      ['➕', 'plus', 'add'],
      ['➖', 'minus', 'remove'],
      ['🔴', 'red circle'],
      ['🟡', 'yellow circle'],
      ['🟢', 'green circle'],
      ['🔵', 'blue circle'],
      ['💤', 'zzz', 'sleep'],
    ],
  },
  {
    id: 'objects',
    label: 'Work and things',
    emoji: [
      ['🎉', 'party popper', 'celebrate tada congratulations'],
      ['🎊', 'confetti ball'],
      ['🎯', 'bullseye', 'target goal'],
      ['🏆', 'trophy', 'win prize'],
      ['🚀', 'rocket', 'launch ship'],
      ['📌', 'pushpin', 'pin'],
      ['📎', 'paperclip', 'attach'],
      ['✏️', 'pencil', 'edit draw'],
      ['📝', 'memo', 'note write'],
      ['📅', 'calendar', 'date'],
      ['📊', 'bar chart'],
      ['📈', 'chart going up', 'growth'],
      ['📉', 'chart going down'],
      ['🔒', 'lock', 'locked private'],
      ['🔑', 'key'],
      ['🔍', 'magnifying glass', 'search find'],
      ['🔗', 'link'],
      ['💬', 'speech bubble', 'comment'],
      ['🗑️', 'wastebasket', 'trash delete'],
      ['🛠️', 'tools', 'fix build'],
      ['🐛', 'bug'],
      ['⏰', 'alarm clock', 'time deadline'],
      ['⌛', 'hourglass', 'wait'],
      ['💰', 'money bag'],
      ['📦', 'package', 'box ship'],
      ['🎨', 'palette', 'design art colour color'],
      ['🖼️', 'framed picture', 'image'],
      ['📷', 'camera', 'photo'],
      ['💻', 'laptop', 'computer'],
      ['📱', 'phone', 'mobile'],
    ],
  },
  {
    id: 'nature',
    label: 'Nature and food',
    emoji: [
      ['☀️', 'sun', 'sunny'],
      ['🌙', 'moon', 'night'],
      ['⛅', 'sun behind cloud'],
      ['🌧️', 'rain cloud'],
      ['⚡', 'lightning', 'zap fast'],
      ['❄️', 'snowflake', 'cold'],
      ['🌈', 'rainbow'],
      ['🌊', 'wave', 'water sea'],
      ['🌱', 'seedling', 'grow'],
      ['🌳', 'tree'],
      ['🌸', 'blossom', 'flower'],
      ['🍀', 'four leaf clover', 'luck'],
      ['🐶', 'dog'],
      ['🐱', 'cat'],
      ['🦄', 'unicorn'],
      ['🐢', 'turtle', 'slow'],
      ['☕', 'coffee', 'tea break'],
      ['🍕', 'pizza'],
      ['🍔', 'burger'],
      ['🍰', 'cake'],
      ['🍺', 'beer'],
      ['🍎', 'apple'],
    ],
  },
];

/**
 * The groups as the picker shows them for what has been typed: all of them for
 * nothing, and otherwise one group of everything whose name or other words hold
 * every word typed.
 */
export function searchEmoji(query: string): readonly EmojiGroup[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return EMOJI_GROUPS;

  const found = new Map<string, EmojiEntry>();
  for (const group of EMOJI_GROUPS) {
    for (const entry of group.emoji) {
      const said = `${entry[1]} ${entry[2] ?? ''}`;
      if (!found.has(entry[0]) && words.every((word) => said.includes(word))) {
        found.set(entry[0], entry);
      }
    }
  }
  return found.size === 0 ? [] : [{ id: 'found', label: 'Results', emoji: [...found.values()] }];
}
