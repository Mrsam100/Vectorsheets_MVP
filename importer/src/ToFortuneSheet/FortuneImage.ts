import { IfortuneImage } from "./IFortune.js";
import {FortuneSheetCelldata} from "./FortuneCell.js";
import { IuploadfileList, IattributeList, isStringContent, isArrayBufferContent } from "../ICommon.js";
import {getXmlAttibute, getColumnWidthPixel, fromulaRef,getRowHeightPixel,getcellrange} from "../common/method.js";
import {borderTypes} from "../common/constant.js";
import { ReadXml, IStyleCollections, Element,getColor } from "./ReadXml.js";
import { FortuneImageBase } from "./FortuneBase.js";
import { UDOC,FromEMF,ToContext2D  } from "../common/emf.js";

/** Supported image extensions */
const IMAGE_EXTENSIONS = new Set(['png', 'jpeg', 'jpg', 'gif', 'bmp', 'tif', 'webp', 'emf']);

export class ImageList {
    private images: IattributeList;

    constructor(files: IuploadfileList) {
        this.images = {};

        if (files == null) {
            return;
        }

        for (const fileKey in files) {
            if (fileKey.indexOf("xl/media/") === -1) {
                continue;
            }

            const fileNameArr = fileKey.split(".");
            const suffix = fileNameArr[fileNameArr.length - 1].toLowerCase();

            if (!IMAGE_EXTENSIONS.has(suffix)) {
                continue;
            }

            const fileContent = files[fileKey];

            if (suffix === "emf") {
                // EMF files require ArrayBuffer content
                if (isArrayBufferContent(fileContent)) {
                    try {
                        const pNum = 0;  // page number to render
                        const scale = 1; // document scale
                        const wrt = new ToContext2D(pNum, scale);

                        FromEMF.K = [];
                        const inp = FromEMF.C;
                        const out = FromEMF.K;
                        const stt = 4;

                        for (const p in inp) {
                            out[inp[p]] = p.slice(stt);
                        }

                        FromEMF.Parse(fileContent, wrt);
                        this.images[fileKey] = wrt.canvas.toDataURL("image/png");
                    } catch (error) {
                        // Skip EMF files that fail to parse
                        continue;
                    }
                }
            } else {
                // Regular image files are already base64 encoded strings
                if (isStringContent(fileContent)) {
                    this.images[fileKey] = fileContent;
                }
            }
        }
    }

    getImageByName(pathName:string):Image{
        if(pathName in this.images){
            let base64 = this.images[pathName];
            return new Image(pathName, base64);
        }
        return null;
    }
}


class Image extends FortuneImageBase {

    fromCol:number
    fromColOff:number
    fromRow:number
    fromRowOff:number

    toCol:number
    toColOff:number
    toRow:number
    toRowOff:number

    constructor(pathName:string, base64:string) {
        super();
        this.src = base64;
    }

    setDefault(){

    }
}