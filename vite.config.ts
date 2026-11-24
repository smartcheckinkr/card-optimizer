import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // 테스트 러너가 localhost DNS를 못 찾는 환경이 있어 IP로 바인딩한다(빌드 결과에는 영향 없음).
  server: { host: '127.0.0.1' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
  },
});
