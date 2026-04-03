import path from "node:path";

export function guessMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".json") {
    return "application/json";
  }

  if (extension === ".md") {
    return "text/markdown";
  }

  if (extension === ".pdf") {
    return "application/pdf";
  }

  return "text/plain";
}
