export type Config = {
  authorization: string;
  cookie: string;
  proxy?: string;
  signal?: AbortSignal
};
