export interface ModelClient {
  generateText(input: { system: string; prompt: string }): Promise<string>;
  generateStructured<T>(input: {
    system: string;
    prompt: string;
    schemaName: string;
  }): Promise<T>;
}

export class NoopModelClient implements ModelClient {
  async generateText(input: { system: string; prompt: string }): Promise<string> {
    return `${input.system}\n\n${input.prompt}`;
  }

  async generateStructured<T>(input: {
    system: string;
    prompt: string;
    schemaName: string;
  }): Promise<T> {
    return {
      schemaName: input.schemaName,
      prompt: input.prompt
    } as T;
  }
}
