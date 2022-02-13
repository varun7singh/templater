import { Injectable } from '@nestjs/common';
import { Lambda, Language, Prisma } from '@prisma/client';
import { LambdaRunFeedback } from './interfaces';
import { NodeVM, VM } from 'vm2';
import { performance } from 'perf_hooks';
import ts = require('typescript');

@Injectable()
export class LambdaService {
  vm: NodeVM;
  constructor() {
    this.vm = new NodeVM({
      console: 'redirect',
      require: {
        external: false,
      },
    });
  }

  process(
    lambda: Lambda | Prisma.LambdaCreateInput,
    data: any,
  ): LambdaRunFeedback {
    // Regex to verify function(data) signature
    const regex = /^function\s*\(([^)]*)\)\s*\{/;
    const match = regex.exec(lambda.body);
    if (!match) {
      return {
        statusCode: 3,
        statusMessage:
          'ERROR: The function signature is not valid. It should be function(data)',
        error: 'Invalid Lambda. It should start with "function(data) {"',
        response: null,
        executionTimeInMs: 0,
        consoleOutput: [],
      };
    } else {
      try {
        const startTime = performance.now();
        const consoleOutput: string[] = [];
        this.vm.on('console.log', (log) => {
          consoleOutput.push(JSON.stringify(log));
        });
        if (lambda.language === Language.TYPESCRIPT) {
          lambda.body = ts.transpile(lambda.body);
        }
        const body = `module.exports = ${lambda.body}`;
        const functionInSandbox = this.vm.run(body);
        const result = functionInSandbox(data);
        const endTime = performance.now();
        return {
          statusCode: 1,
          statusMessage: 'OK',
          error: null,
          response: result,
          consoleOutput: consoleOutput,
          executionTimeInMs: endTime - startTime,
        };
      } catch (e) {
        console.error(e);
        return {
          statusCode: 0,
          statusMessage: 'ERROR',
          error: e.message,
          response: null,
          consoleOutput: null,
          executionTimeInMs: null,
        };
      }
    }
  }
}