import type { GuApi } from '../shared/contracts';

declare global {
  interface Window {
    gu: GuApi;
  }
}

export {};
