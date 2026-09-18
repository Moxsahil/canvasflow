import { BadRequestException, Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthService, type SignupResult } from './auth.service.js';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

/**
 * The only gate that counts. A `minLength` on the form is a convenience the
 * browser enforces and anything posting straight at this route ignores, so the
 * rules live here, where a request cannot get past them.
 */
const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .regex(/[A-Z]/, 'Include a capital letter')
  .regex(/[0-9]/, 'Include a number')
  .regex(/[^A-Za-z0-9]/, 'Include a special character');

const signupSchema = z.object({
  // Trimmed, validated, then lowered. Every major provider treats an address
  // case-insensitively, so storing one canonical form is what stops the same
  // person holding two accounts.
  email: z.string().trim().email('Invalid email').toLowerCase(),
  password: passwordSchema,
  name: z.string().trim().min(1, 'Name is required'),
});

/**
 * Deliberately unguarded. This is where an account begins, so there is no
 * token to present yet; what protects it is the per-IP limit that belongs in
 * front of it.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  @HttpCode(201)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async signup(@Body() body: unknown): Promise<{ data: SignupResult }> {
    const parsed = signupSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid signup payload');
    }

    return { data: await this.auth.signup(parsed.data) };
  }
}
