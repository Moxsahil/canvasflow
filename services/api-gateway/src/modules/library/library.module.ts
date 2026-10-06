import { Module } from '@nestjs/common';
import { AddedLibrariesController, LibraryController } from './library.controller.js';

@Module({
  controllers: [LibraryController, AddedLibrariesController],
})
export class LibraryModule {}
