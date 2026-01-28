import { IfortunesheetDataVerificationType } from "./ToFortuneSheet/IFortune.js";

/**
 * Represents the content of a file in the uploaded file list.
 * Can be a string (XML/text content, base64 images) or ArrayBuffer (EMF files)
 */
export type FileContent = string | ArrayBuffer;

/**
 * Map of file paths to their content within an XLSX archive
 */
export interface IuploadfileList {
    [filePath: string]: FileContent;
}

/**
 * Map of string keys to numeric values
 * Used for operator mappings, column indices, etc.
 */
export interface stringToNum {
    [key: string]: number;
}

/**
 * Map of numeric indices to string values
 * Used for reverse lookups like number format IDs to format strings
 */
export interface numTostring {
    [index: number]: string;
}

/**
 * Generic attribute list for XML element attributes
 */
export interface IattributeList {
    [attributeName: string]: string;
}

/**
 * Map of cell references to data verification rules
 */
export interface IDataVerificationMap {
    [cellRef: string]: IfortunesheetDataVerificationType;
}

/**
 * Map for data verification type2 lookups
 */
export interface IDataVerificationType2Map {
    [verificationType: string]: { [operator: string]: string };
}

/**
 * Supported image file extensions
 */
export type ImageExtension = 'png' | 'jpeg' | 'jpg' | 'gif' | 'bmp' | 'tif' | 'webp';

/**
 * Check if a file extension is a supported image type
 */
export function isImageExtension(ext: string): ext is ImageExtension {
    return ['png', 'jpeg', 'jpg', 'gif', 'bmp', 'tif', 'webp'].includes(ext.toLowerCase());
}

/**
 * Check if file content is a string
 */
export function isStringContent(content: FileContent): content is string {
    return typeof content === 'string';
}

/**
 * Check if file content is an ArrayBuffer
 */
export function isArrayBufferContent(content: FileContent): content is ArrayBuffer {
    return content instanceof ArrayBuffer;
}
