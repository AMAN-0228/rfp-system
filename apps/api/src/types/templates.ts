export interface Field {
    label: string;
    type: string;
    mandatory: boolean;
    options?: string[];
    systemKey?: string;
    key: string;
    // identifier: string;
}

export interface Section {
    label: string;
    sectiontype: string;
    fields: Record<string, Field>;
    fieldOrder: string[];
    key: string;
}

export interface TemplateSchema {
    id?: number;
    label: string;
    sections: Record<string, Section>;
    sectionOrder: string[];
}