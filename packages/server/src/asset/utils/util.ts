import { InternalServerErrorException } from "@nestjs/common";

export function ensureMax8Decimals(value: number, fieldName: string) {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      throw new InternalServerErrorException(`Invalid ${fieldName}: ${value}`);
    }
    const valueStr = value.toString();
    if (valueStr.includes('.')) {
      const [, decimalPart] = valueStr.split('.');
      if (decimalPart.length > 8) {
        throw new InternalServerErrorException(
          `${fieldName}는 소수점 8자리를 초과할 수 없습니다. (입력값: ${value})`,
        );
      }
    }
  }
  