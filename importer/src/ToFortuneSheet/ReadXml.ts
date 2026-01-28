import { XMLParser } from "fast-xml-parser";
import { IuploadfileList, IattributeList } from "../ICommon.js";
import { indexedColors } from "../common/constant.js";
import { LightenDarkenColor } from "../common/method.js";

// XML Parser configuration
const parserOptions = {
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    parseAttributeValue: false,
    trimValues: true,
    isArray: (name: string, jpath: string, isLeafNode: boolean, isAttribute: boolean) => {
        // Always treat certain elements as arrays for consistency
        return !isAttribute;
    }
};

const xmlParser = new XMLParser(parserOptions);

// Cache for parsed XML files
const parsedXmlCache = new Map<string, any>();

/**
 * Element class that wraps parsed XML data and provides a consistent API
 */
export class Element {
    private parsedData: any;
    private tagName: string;
    attributeList: IattributeList;
    value: string;
    container: string;
    elementString: string;

    constructor(data: any, tagName: string = "") {
        this.parsedData = data;
        this.tagName = tagName;
        this.attributeList = {};
        this.value = "";
        this.container = "";
        this.elementString = "";

        this.extractAttributes();
        this.extractValue();
        this.buildContainer();
    }

    private extractAttributes(): void {
        if (!this.parsedData || typeof this.parsedData !== 'object') {
            return;
        }

        for (const key of Object.keys(this.parsedData)) {
            if (key.startsWith("@_")) {
                const attrName = key.substring(2);
                this.attributeList[attrName] = String(this.parsedData[key]);
            }
        }
    }

    private extractValue(): void {
        if (this.parsedData === null || this.parsedData === undefined) {
            this.value = "";
            return;
        }

        if (typeof this.parsedData !== 'object') {
            this.value = String(this.parsedData);
            return;
        }

        if ("#text" in this.parsedData) {
            this.value = String(this.parsedData["#text"]);
        } else {
            // Collect all non-attribute child content
            const childParts: string[] = [];
            for (const key of Object.keys(this.parsedData)) {
                if (!key.startsWith("@_") && key !== "#text") {
                    childParts.push(key);
                }
            }
            // Value is empty if there are child elements (they're accessed via getInnerElements)
            this.value = childParts.length > 0 ? "" : "";
        }
    }

    private buildContainer(): void {
        // Build a pseudo-container string for backward compatibility
        const attrs = Object.entries(this.attributeList)
            .map(([k, v]) => `${k}="${v}"`)
            .join(" ");

        if (this.tagName) {
            this.container = attrs ? `<${this.tagName} ${attrs}>` : `<${this.tagName}>`;
            this.elementString = this.container;
        }
    }

    /**
     * Get attribute by key
     */
    get(name: string): string | number | boolean {
        return this.attributeList[name];
    }

    /**
     * Get inner elements by tag name(s)
     * Supports pipe-separated multiple tags: "tag1|tag2|tag3"
     */
    getInnerElements(tag: string): Element[] | null {
        if (!this.parsedData || typeof this.parsedData !== 'object') {
            return null;
        }

        const tags = tag.split("|");
        const elements: Element[] = [];

        for (const t of tags) {
            const tagData = this.parsedData[t];
            if (tagData !== undefined) {
                if (Array.isArray(tagData)) {
                    for (const item of tagData) {
                        elements.push(new Element(item, t));
                    }
                } else {
                    elements.push(new Element(tagData, t));
                }
            }
        }

        return elements.length > 0 ? elements : null;
    }
}

/**
 * ReadXml class for parsing XLSX XML files
 */
export class ReadXml {
    originFile: IuploadfileList;

    constructor(files: IuploadfileList) {
        this.originFile = files;
        parsedXmlCache.clear(); // Clear cache for new file set
    }

    /**
     * Parse XML file and cache the result
     */
    private parseXmlFile(fileName: string): any {
        const file = this.getFileByName(fileName);
        if (!file) {
            return null;
        }

        const cacheKey = fileName;
        if (parsedXmlCache.has(cacheKey)) {
            return parsedXmlCache.get(cacheKey);
        }

        try {
            const parsed = xmlParser.parse(file);
            parsedXmlCache.set(cacheKey, parsed);
            return parsed;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to parse XML file "${fileName}": ${errorMessage}`);
        }
    }

    /**
     * Get elements by tag path
     * @param path - Tag path like "sst/si" or "sheets/sheet"
     * @param fileName - File name to search in
     * @returns Array of Element objects
     */
    getElementsByTagName(path: string, fileName: string): Element[] {
        const parsed = this.parseXmlFile(fileName);
        if (!parsed) {
            return [];
        }

        const pathArr = path.split("/");
        let current: any = parsed;

        // Navigate through the path
        for (const pathPart of pathArr) {
            if (!current) {
                return [];
            }

            // Handle pipe-separated tags (e.g., "a:dk1|a:lt1|a:dk2")
            const tags = pathPart.split("|");
            let found: any[] = [];

            for (const tag of tags) {
                if (current[tag] !== undefined) {
                    const data = current[tag];
                    if (Array.isArray(data)) {
                        found = found.concat(data);
                    } else {
                        found.push(data);
                    }
                }
            }

            if (found.length === 0) {
                // Try to find in nested structure (for root elements)
                for (const key of Object.keys(current)) {
                    if (!key.startsWith("@_") && key !== "#text" && typeof current[key] === 'object') {
                        const nested = current[key];
                        for (const tag of tags) {
                            if (nested && nested[tag] !== undefined) {
                                const data = nested[tag];
                                if (Array.isArray(data)) {
                                    found = found.concat(data);
                                } else {
                                    found.push(data);
                                }
                            }
                        }
                    }
                }
            }

            if (found.length === 0) {
                return [];
            }

            // If this is the last path part, we want the found items
            // Otherwise, we need to continue navigating
            if (pathPart === pathArr[pathArr.length - 1]) {
                current = found;
            } else {
                // Merge all found items for next iteration
                current = found.length === 1 ? found[0] : found;
            }
        }

        // Convert to Element array
        if (!current) {
            return [];
        }

        const items = Array.isArray(current) ? current : [current];
        const lastTag = pathArr[pathArr.length - 1].split("|")[0];

        return items.map(item => new Element(item, lastTag));
    }

    /**
     * Get file content by name
     */
    private getFileByName(name: string): string {
        for (const fileKey of Object.keys(this.originFile)) {
            if (fileKey.indexOf(name) > -1) {
                const content = this.originFile[fileKey];
                // Skip non-string content (like ArrayBuffer for EMF files)
                if (typeof content === 'string') {
                    return content;
                }
            }
        }
        return "";
    }
}

export interface IStyleCollections {
    [index: string]: Element[] | IattributeList;
}

function combineIndexedColor(indexedColorsInner: Element[], indexedColors: IattributeList): IattributeList {
    const ret: IattributeList = {};
    if (indexedColorsInner == null || indexedColorsInner.length == 0) {
        return indexedColors;
    }
    for (const key in indexedColors) {
        const value = indexedColors[key];
        const kn = parseInt(key);
        const inner = indexedColorsInner[kn];
        if (inner == null) {
            ret[key] = value;
        } else {
            const rgb = inner.attributeList.rgb;
            ret[key] = rgb;
        }
    }
    return ret;
}

/**
 * Get color from color element
 */
export function getColor(color: Element, styles: IStyleCollections, type: string = "g"): string | undefined {
    const attrList = color.attributeList;
    const clrScheme = styles["clrScheme"] as Element[];
    const indexedColorsInner = styles["indexedColors"] as Element[];
    const indexedColorsList = combineIndexedColor(indexedColorsInner, indexedColors);
    const indexed = attrList.indexed;
    const rgb = attrList.rgb;
    const theme = attrList.theme;
    const tint = attrList.tint;
    let bg: string | undefined;

    if (indexed != null) {
        const indexedNum = parseInt(indexed);
        bg = indexedColorsList[indexedNum];
        if (bg != null) {
            bg = bg.substring(bg.length - 6, bg.length);
            bg = "#" + bg;
        }
    } else if (rgb != null) {
        const rgbClean = rgb.substring(rgb.length - 6, rgb.length);
        bg = "#" + rgbClean;
    } else if (theme != null) {
        let themeNum = parseInt(theme);
        if (themeNum == 0) {
            themeNum = 1;
        } else if (themeNum == 1) {
            themeNum = 0;
        } else if (themeNum == 2) {
            themeNum = 3;
        } else if (themeNum == 3) {
            themeNum = 2;
        }
        const clrSchemeElement = clrScheme[themeNum];
        if (clrSchemeElement != null) {
            const clrs = clrSchemeElement.getInnerElements("a:sysClr|a:srgbClr");
            if (clrs != null) {
                const clr = clrs[0];
                const clrAttrList = clr.attributeList;
                if (clr.container.indexOf("sysClr") > -1) {
                    if (clrAttrList.lastClr != null) {
                        bg = "#" + clrAttrList.lastClr;
                    } else if (clrAttrList.val != null) {
                        bg = "#" + clrAttrList.val;
                    }
                } else if (clr.container.indexOf("srgbClr") > -1) {
                    bg = "#" + clrAttrList.val;
                }
            }
        }
    }

    if (tint != null) {
        const tintNum = parseFloat(tint);
        if (bg != null) {
            bg = LightenDarkenColor(bg, tintNum);
        }
    }

    return bg;
}

/**
 * Get line string attribute value
 */
export function getlineStringAttr(frpr: Element, attr: string): string | undefined {
    const attrEle = frpr.getInnerElements(attr);
    let value: string | undefined;

    if (attrEle != null && attrEle.length > 0) {
        if (attr == "b" || attr == "i" || attr == "strike") {
            value = "1";
        } else if (attr == "u") {
            const v = attrEle[0].attributeList.val;
            if (v == "double") {
                value = "2";
            } else if (v == "singleAccounting") {
                value = "3";
            } else if (v == "doubleAccounting") {
                value = "4";
            } else {
                value = "1";
            }
        } else if (attr == "vertAlign") {
            const v = attrEle[0].attributeList.val;
            if (v == "subscript") {
                value = "1";
            } else if (v == "superscript") {
                value = "2";
            }
        } else {
            value = attrEle[0].attributeList.val;
        }
    }

    return value;
}
