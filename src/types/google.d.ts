// src/types/google.d.ts
/**
 * Google Identity Services 类型定义
 */

declare namespace google {
  namespace accounts {
    namespace oauth2 {
      interface TokenClient {
        callback: (response: TokenResponse) => void;
        requestAccessToken(options?: { prompt?: string }): void;
      }

      interface TokenResponse {
        access_token: string;
        expires_in: number;
        scope: string;
        token_type: string;
        error?: string;
        error_description?: string;
      }

      interface InitTokenClientConfig {
        client_id: string;
        scope: string;
        callback: string | ((response: TokenResponse) => void);
        error_callback?: (error: any) => void;
      }

      function initTokenClient(config: InitTokenClientConfig): TokenClient;
      function revoke(accessToken: string, callback?: () => void): void;
    }
  }
}

declare const gapi: any;
