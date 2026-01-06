import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/bundle.js'),
      name: 'MakeHuman',
      fileName: 'makehuman-js',
      formats: ['es', 'umd']
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: ['three'],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          three: 'THREE'
        }
      }
    }
  },
  resolve: {
    alias: {
      'src': path.resolve(__dirname, './src'),
    },
  },
});
