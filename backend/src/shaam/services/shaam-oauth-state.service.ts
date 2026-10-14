import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { ShaamEnvironment } from '../shaam.constants';
import { ShaamOauthState } from '../entities/shaam-oauth-state.entity';
import { ShaamProduct } from '../entities/shaam.enums';

@Injectable()
export class ShaamOauthStateService {
  constructor(
    @InjectRepository(ShaamOauthState)
    private readonly repo: Repository<ShaamOauthState>,
  ) {}

  async create(
    businessId: number,
    actorFirebaseId: string,
    product: ShaamProduct,
    environment: ShaamEnvironment,
  ): Promise<string> {
    await this.repo
      .createQueryBuilder()
      .delete()
      .where('expires_at < :now', { now: new Date() })
      .execute();
    const raw = crypto.randomBytes(32).toString('base64url');
    await this.repo.save(
      this.repo.create({
        stateHash: this.hash(raw),
        businessId,
        actorFirebaseId,
        product,
        environment,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        consumedAt: null,
      }),
    );
    return raw;
  }

  async consume(raw: string): Promise<ShaamOauthState> {
    if (!raw) throw this.invalid();
    return this.repo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(ShaamOauthState);
      const row = await repo
        .createQueryBuilder('state')
        .setLock('pessimistic_write')
        .where('state.state_hash = :hash', { hash: this.hash(raw) })
        .getOne();
      if (!row || row.consumedAt || row.expiresAt.getTime() <= Date.now()) {
        throw this.invalid();
      }
      row.consumedAt = new Date();
      return repo.save(row);
    });
  }

  private hash(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private invalid(): UnauthorizedException {
    return new UnauthorizedException('Invalid or expired SHAAM OAuth state');
  }
}
