import type {
    ImportXMLError,
    ImportXMLResult,
    SaveSVGResult,
    SaveXMLOptions,
    SaveXMLResult,
} from "bpmn-js/lib/BaseViewer";

interface DiagramXmlImporter {
    importXML(xml: string): Promise<ImportXMLResult>;
}

interface DiagramXmlExporter {
    saveXML(options: SaveXMLOptions): Promise<SaveXMLResult>;
}

interface DiagramSvgExporter {
    saveSVG(): Promise<SaveSVGResult>;
}

/**
 * Imports `xml`, folding bpmn-js's parser warnings into the rejection message
 * (the original failure stays reachable as `cause`). Any other failure, such as
 * `NoModelerError`, is rethrown unchanged.
 */
export async function importDiagram(
    importer: DiagramXmlImporter,
    xml: string,
): Promise<ImportXMLResult> {
    try {
        return await importer.importXML(xml);
    } catch (error: unknown) {
        throw toImportError(error);
    }
}

function toImportError(error: unknown): unknown {
    // An empty warnings array is truthy too, so every bpmn-js import failure is wrapped.
    if (!(error as Partial<ImportXMLError>).warnings) {
        return error;
    }
    const importError = error as ImportXMLError;
    return new Error(`${importError.message} ${importError.warnings}`, { cause: error });
}

export async function exportFormattedXml(exporter: DiagramXmlExporter): Promise<string> {
    const { xml } = await exporter.saveXML({ format: true });
    // bpmn-js rejects on failure, so a resolved export always carries the XML.
    return xml!;
}

export async function exportSvg(exporter: DiagramSvgExporter): Promise<string> {
    const { svg } = await exporter.saveSVG();
    return svg;
}
