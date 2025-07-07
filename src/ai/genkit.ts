
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

// The googleAI plugin automatically looks for the GEMINI_API_KEY environment variable.
// Make sure to set this in your hosting environment for the AI features (like SMS parsing) to work.
export const ai = genkit({
  plugins: [
    googleAI(),
  ],
});
