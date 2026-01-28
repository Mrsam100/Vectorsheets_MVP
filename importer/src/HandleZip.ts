import JSZip from "jszip";
import { IuploadfileList, FileContent, isImageExtension } from "./ICommon.js";

/**
 * Supported image extensions for base64 conversion
 */
const IMAGE_EXTENSIONS = new Set(['png', 'jpeg', 'jpg', 'gif', 'bmp', 'tif', 'webp']);

/**
 * HandleZip class for extracting XLSX files
 * XLSX files are ZIP archives containing XML files and media
 */
export class HandleZip {
    uploadFile: File;

    constructor(file: File) {
        if (!file) {
            throw new Error("File is required");
        }
        this.uploadFile = file;
    }

    /**
     * Unzip the XLSX file and return its contents
     * @returns Promise resolving to a map of file paths to their contents
     * @throws Error if the file cannot be unzipped or is not a valid XLSX
     */
    async unzipFile(): Promise<IuploadfileList> {
        let zip: JSZip;

        try {
            zip = await JSZip.loadAsync(this.uploadFile);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to unzip file "${this.uploadFile.name}": ${message}`);
        }

        const fileList: IuploadfileList = {};

        for (const [_path, zipEntry] of Object.entries(zip.files)) {
            // Skip directories
            if (zipEntry.dir) {
                continue;
            }

            const fileName = zipEntry.name;
            const fileNameArr = fileName.split(".");
            const suffix = fileNameArr[fileNameArr.length - 1].toLowerCase();

            let content: FileContent;

            try {
                if (IMAGE_EXTENSIONS.has(suffix)) {
                    // Convert images to base64 data URIs
                    const base64Data = await zipEntry.async("base64");
                    content = `data:image/${suffix};base64,${base64Data}`;
                } else if (suffix === "emf") {
                    // EMF files are kept as ArrayBuffer for later processing
                    content = await zipEntry.async("arraybuffer");
                } else {
                    // All other files (XML, rels, etc.) are read as strings
                    content = await zipEntry.async("string");
                }

                fileList[zipEntry.name] = content;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(`Failed to extract file "${fileName}": ${message}`);
            }
        }

        // Validate that this looks like an XLSX file
        if (!this.validateXlsxStructure(fileList)) {
            throw new Error(`File "${this.uploadFile.name}" does not appear to be a valid XLSX file`);
        }

        return fileList;
    }

    /**
     * Basic validation that the extracted files look like an XLSX structure
     */
    private validateXlsxStructure(fileList: IuploadfileList): boolean {
        const requiredFiles = [
            '[Content_Types].xml',
            'xl/workbook.xml'
        ];

        for (const required of requiredFiles) {
            const hasFile = Object.keys(fileList).some(
                path => path.toLowerCase() === required.toLowerCase()
            );
            if (!hasFile) {
                return false;
            }
        }

        return true;
    }
}
