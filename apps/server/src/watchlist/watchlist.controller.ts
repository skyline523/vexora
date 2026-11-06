import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { WatchlistRepository } from '@vexora/database';
import { createMarketSymbol, ok, parseSymbolId } from '@vexora/shared';
import { z } from 'zod';

const addSchema = z.object({
  symbolId: z.string().min(1),
});

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

@Controller('watchlist')
export class WatchlistController {
  constructor(private readonly watchlist: WatchlistRepository) {}

  @Get()
  async list() {
    return ok(await this.watchlist.list());
  }

  @Post()
  async add(@Body() body: unknown) {
    const parsed = addSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }

    let symbol;
    try {
      symbol = createMarketSymbol(parseSymbolId(parsed.data.symbolId));
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid symbolId');
    }

    const item = await this.watchlist.add({
      symbolId: symbol.symbolId,
      exchange: symbol.exchange,
      marketType: symbol.marketType,
      base: symbol.base,
      quote: symbol.quote,
      rawSymbol: symbol.rawSymbol,
    });
    return ok(item);
  }

  @Patch('reorder')
  async reorder(@Body() body: unknown) {
    const parsed = reorderSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.message);
    }
    return ok(await this.watchlist.reorder(parsed.data.orderedIds));
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const byId = await this.watchlist.findById(id);
    if (byId) {
      await this.watchlist.removeById(id);
      return ok({ removed: true, id });
    }

    const bySymbol = await this.watchlist.findBySymbolId(id);
    if (!bySymbol) {
      throw new NotFoundException(`Watchlist item not found: ${id}`);
    }
    await this.watchlist.removeBySymbolId(id);
    return ok({ removed: true, id: bySymbol.id });
  }
}
