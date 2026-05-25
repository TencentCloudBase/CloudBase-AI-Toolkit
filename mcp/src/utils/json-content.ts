export function jsonContent(body: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(body, null, 2),
      },
    ],
  };
}
