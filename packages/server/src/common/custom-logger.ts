import { Logger } from '@nestjs/common';

export class CustomLogger extends Logger {
  constructor(context: string) {
    // NestJS Logger의 context 인자에 "AccountController" 등 원하는 문자열
    super(context);
  }

}
