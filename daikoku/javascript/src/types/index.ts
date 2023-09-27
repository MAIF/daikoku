import { SwaggerUIBundle } from 'swagger-ui-dist';

declare global {
  interface Window {
    ui: SwaggerUIBundle;
  }
}

export * from './tenant';
export * from './types';
export * from './api';
export * from './team';
export * from './context';
export * from './gql';
