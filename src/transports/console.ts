import type { PredictionResult, PredictionTransport } from "../types.js";
import { formatShortPredictionMessage } from "./format.js";

export class ConsoleTransport implements PredictionTransport {
  readonly name = "console";

  async sendPrediction(prediction: PredictionResult): Promise<void> {
    process.stdout.write(`${formatShortPredictionMessage(prediction)}\n\n`);
  }
}

