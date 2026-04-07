export type Source = {
  id: string;
  title: string;
  section: string;
  excerpt: string;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  traceId?: string;
};
