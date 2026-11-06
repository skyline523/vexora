import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ModelConfigRepository } from '@vexora/database';
import { ok } from '@vexora/shared';
import { z } from 'zod';

const createSchema = z.object({
  provider: z.string().min(1),
  label: z.string().min(1),
  baseUrl: z.string().url(),
  modelId: z.string().min(1),
  apiKey: z.string().nullable().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  supportsTools: z.number().int().min(0).max(1).optional(),
  isDefault: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

@Controller('models')
export class ModelsController {
  constructor(private readonly models: ModelConfigRepository) {}

  @Get()
  async list() {
    return ok(await this.models.list());
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    return ok(await this.models.create(parsed.data));
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    const updated = await this.models.update(id, parsed.data);
    if (!updated) {
      throw new NotFoundException(`Model config not found: ${id}`);
    }
    return ok(updated);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    if (!(await this.models.remove(id))) {
      throw new NotFoundException(`Model config not found: ${id}`);
    }
    return ok({ removed: true, id });
  }

  @Post(':id/default')
  async setDefault(@Param('id') id: string) {
    const updated = await this.models.setDefault(id);
    if (!updated) {
      throw new NotFoundException(`Model config not found: ${id}`);
    }
    return ok(updated);
  }
}
