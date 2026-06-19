// Type declaration for prompts.json
declare module './prompts.json' {
  interface PromptRule {
    id: string;
    title: string;
    description: string;
    category: string;
    order: number;
    prompts: string[];
  }
  
  const promptsData: PromptRule[];
  export default promptsData;
}


