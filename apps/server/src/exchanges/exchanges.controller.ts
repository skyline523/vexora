import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ExchangeConfigRepository } from '@vexora/database';
import { ok } from '@vexora/shared';
import { z } from 'zod';

const createSchema = z.object({
  exchange: z.string().min(1),
  label: z.string().min(1),
  enabled: z.boolean().optional(),
  apiKey: z.string().nullable().optional(),
  apiSecret: z.string().nullable().optional(),
});

const updateSchema = z.object({
  exchange: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  apiKey: z.string().nullable().optional(),
  apiSecret: z.string().nullable().optional(),
});

@Controller('exchanges')
export class ExchangesController {
  constructor(private readonly exchanges: ExchangeConfigRepository) {}

  @Get()
  async list() {
    return ok(await this.exchanges.list());
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    return ok(await this.exchanges.create(parsed.data));
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }

    const existing = await this.exchanges.findById(id);
    if (!existing) {
      throw new NotFoundException(`Exchange config not found: ${id}`);
    }

    const updated = await this.exchanges.update(id, {
      label: parsed.data.label ?? existing.label,
      exchange: parsed.data.exchange,
      enabled: parsed.data.enabled,
      apiKey: parsed.data.apiKey,
      apiSecret: parsed.data.apiSecret,
    });
    return ok(updated!);
  }

  @Post(':id/test-connection')
  async testConnection(@Param('id') id: string) {
    const config = await this.exchanges.findById(id);
    if (!config) {
      throw new NotFoundException(`Exchange config not found: ${id}`);
    }
    return ok({
      id: config.id,
      exchange: config.exchange,
      ok: config.enabled,
      message: config.enabled
        ? 'Exchange config is enabled (public market endpoints).'
        : 'Exchange config is disabled.',
    });
  }
}
