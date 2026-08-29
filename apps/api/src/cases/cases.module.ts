import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../common/roles.guard';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';

@Module({
  imports: [AuthModule],
  controllers: [CasesController],
  providers: [CasesService, RolesGuard],
  exports: [CasesService],
})
export class CasesModule {}
