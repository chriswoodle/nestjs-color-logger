# NestJS Color Logger 🌈

A custom fork of [@nestjs/common Console Logger](https://github.com/nestjs/nest/blob/master/packages/common/services/console-logger.service.ts), but with colored contexts. Inspired by [debug](https://www.npmjs.com/package/debug).

![Screenshot](./Screenshot.png?raw=true)

# Installation
```shell
npm install nestjs-color-logger
# or
yarn add nestjs-color-logger
```

# Usage
`nestjs-color-logger` is a drop in replacement for the [NestJS Logger].(https://docs.nestjs.com/techniques/logger)

In your `main.ts`:
```typescript
import { NestFactory } from '@nestjs/core';
import { ColorLogger } from 'nestjs-color-logger';
import { AppModule } from './app.module'; // Your app module

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        logger: new ColorLogger(),
    });
    // ...
}

```
In your controllers:
```typescript
import { Controller, Get } from '@nestjs/common';
import { ColorLogger } from 'nestjs-color-logger';

@Controller('hello')
export class HelloController {
    private readonly logger = new ColorLogger()

    @Get()
    async hello() {
        this.logger.log('Hello World')
        return;
    }
}
```

# License
MIT