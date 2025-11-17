import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { config } from '@/config/env';
import type { JWTPayload, AuthenticatedUser, UserRole } from '@/types';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  role: UserRole;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  tokenId: string;
  iat: number;
  exp: number;
}

export class AuthService {
  private readonly SALT_ROUNDS = 12;

  /**
   * Hash password using bcrypt with salt
   */
  async hashPassword(password: string): Promise<{ hash: string; salt: string }> {
    const salt = await bcrypt.genSalt(this.SALT_ROUNDS);
    const hash = await bcrypt.hash(password, salt);
    return { hash, salt };
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT access token using RSA private key
   */
  generateAccessToken(user: AuthenticatedUser): string {
    const payload: JWTPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.parseTokenExpiration(config.JWT_ACCESS_TOKEN_EXPIRES_IN)
    };

    // Convertir \n literales a saltos de línea reales
    const privateKey = config.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    
    return jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
      issuer: 'evaluacode-api',
      audience: 'evaluacode-client'
    });
  }

  /**
   * Generate refresh token (opaque token stored in database)
   */
  generateRefreshToken(user: AuthenticatedUser): string {
    const tokenId = this.generateTokenId();
    const payload: RefreshTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.parseTokenExpiration(config.JWT_REFRESH_TOKEN_EXPIRES_IN)
    };

    return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
      algorithm: 'HS256',
      issuer: 'evaluacode-api'
    });
  }

  /**
   * Verify and decode access token using RSA public key
   */
  verifyAccessToken(token: string): JWTPayload {
    try {
      // Convertir \n literales a saltos de línea reales
      const publicKey = config.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');
      
      const decoded = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        issuer: 'evaluacode-api',
        audience: 'evaluacode-client'
      }) as JWTPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      }
      throw error;
    }
  }

  /**
   * Verify and decode refresh token
   */
  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET, {
        algorithms: ['HS256'],
        issuer: 'evaluacode-api'
      }) as RefreshTokenPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Refresh token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid refresh token');
      }
      throw error;
    }
  }

  /**
   * Generate complete token pair
   */
  generateTokenPair(user: AuthenticatedUser): TokenPair {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);
    const expiresIn = this.parseTokenExpiration(config.JWT_ACCESS_TOKEN_EXPIRES_IN);

    return {
      accessToken,
      refreshToken,
      expiresIn
    };
  }

  /**
   * Parse token expiration string to seconds
   */
  private parseTokenExpiration(expiry: string): number {
    const timeValue = parseInt(expiry.slice(0, -1));
    const timeUnit = expiry.slice(-1);

    switch (timeUnit) {
      case 's': return timeValue;
      case 'm': return timeValue * 60;
      case 'h': return timeValue * 60 * 60;
      case 'd': return timeValue * 24 * 60 * 60;
      default: return 900; // 15 minutes default
    }
  }

  /**
   * Generate unique token ID for refresh tokens
   */
  private generateTokenId(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  /**
   * Generate secure random password for system accounts
   */
  generateSecurePassword(length: number = 16): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  }
}

export const authService = new AuthService();
