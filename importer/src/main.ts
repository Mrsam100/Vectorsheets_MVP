import { FortuneFile } from "./ToFortuneSheet/FortuneFile.js";
import type { FortuneFileBase } from "./ToFortuneSheet/FortuneBase.ts";
import { HandleZip } from "./HandleZip.js";

/**
 * Error class for Excel parsing errors
 */
export class ExcelParseError extends Error {
    public readonly fileName: string;
    public readonly cause?: Error;

    constructor(message: string, fileName: string, cause?: Error) {
        super(message);
        this.name = 'ExcelParseError';
        this.fileName = fileName;
        this.cause = cause;
    }
}

/**
 * Transform an Excel (.xlsx) file to FortuneSheet format
 *
 * @param excelFile - The Excel file to transform (must be .xlsx format)
 * @returns Promise resolving to FortuneFileBase containing the parsed spreadsheet data
 * @throws ExcelParseError if the file cannot be parsed
 *
 * @example
 * ```typescript
 * const fileInput = document.getElementById('file-input') as HTMLInputElement;
 * const file = fileInput.files[0];
 *
 * try {
 *   const fortuneData = await transformExcelToFortune(file);
 *   console.log('Sheets:', fortuneData.sheets.length);
 * } catch (error) {
 *   if (error instanceof ExcelParseError) {
 *     console.error(`Failed to parse ${error.fileName}: ${error.message}`);
 *   }
 * }
 * ```
 */
export const transformExcelToFortune = async (
    excelFile: File,
): Promise<FortuneFileBase> => {
    // Input validation
    if (!excelFile) {
        throw new ExcelParseError("No file provided", "unknown");
    }

    if (!(excelFile instanceof File)) {
        throw new ExcelParseError("Input must be a File object", "unknown");
    }

    const fileName = excelFile.name || "unknown";

    // Validate file extension
    const extension = fileName.split('.').pop()?.toLowerCase();
    if (extension !== 'xlsx') {
        throw new ExcelParseError(
            `Unsupported file format: .${extension}. Only .xlsx files are supported.`,
            fileName
        );
    }

    try {
        // Step 1: Unzip the XLSX file
        const handleZip = new HandleZip(excelFile);
        const files = await handleZip.unzipFile();

        // Step 2: Parse the Excel content
        const fortuneFile = new FortuneFile(files, fileName);
        fortuneFile.Parse();

        // Step 3: Serialize to FortuneSheet format
        return fortuneFile.serialize();
    } catch (error) {
        // Re-throw ExcelParseError as-is
        if (error instanceof ExcelParseError) {
            throw error;
        }

        // Wrap other errors with context
        const message = error instanceof Error ? error.message : String(error);
        const cause = error instanceof Error ? error : undefined;

        throw new ExcelParseError(
            `Failed to parse Excel file: ${message}`,
            fileName,
            cause
        );
    }
};

// Re-export types for consumers
export type { FortuneFileBase } from "./ToFortuneSheet/FortuneBase.ts";
