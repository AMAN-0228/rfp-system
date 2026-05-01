import * as templateRepository from "../repositories/templateRepository";
import { FIELD_TYPES, SECTION_TYPES, TEMPLATE_TYPES } from "../utils/constant";
import { NotFoundError, ValidationError } from "../utils/errors";
import { TokenPayload } from "../utils/tokens";
import { deepCopy } from "../utils/common";
import { Field, Section, TemplateSchema } from "../types/templates";


const validateField = (fieldData: Field) => {

    if (!fieldData.label || fieldData.label.trim() === '') {
        throw new ValidationError(`Field ${fieldData.label} label is required`);
    }
    if (!fieldData.type || fieldData.type.trim() === '') {
        throw new ValidationError(`Field ${fieldData.label} type is required`);
    }
    if (!Object.keys(FIELD_TYPES).includes(fieldData.type)) {
        throw new ValidationError(`Field ${fieldData.label} type is invalid`);
    }
    if (!fieldData.systemKey || fieldData.systemKey.trim() === '') {
        throw new ValidationError(`Field ${fieldData.label} system key is required`);
    }
    if (!fieldData.key || fieldData.key.trim() === '') {
        throw new ValidationError(`Field ${fieldData.label} key is required`);
    }

    return {
        label: fieldData.label,
        type: fieldData.type,
        mandatory: fieldData.mandatory,
        options: fieldData.options,
        systemKey: fieldData.systemKey,
        key: fieldData.key,
    } as Field;
}

const validateSection = (sectionData: Section, sectionKey: string) => {
    const sectionObj: Section = {
        label: '',
        sectiontype: '',
        fields: {},
        fieldOrder: [],
        key: '',
    } as Section;

    if (!sectionData.label || sectionData.label.trim() === '') {
        throw new ValidationError(`Section ${sectionKey} label is required`);
    }
    if (!sectionData.sectiontype || sectionData.sectiontype.trim() === '') {
        throw new ValidationError(`Section ${sectionKey} section type is required`);
    }
    if (!Object.keys(SECTION_TYPES).includes(sectionData.sectiontype)) {
        throw new ValidationError(`Section ${sectionKey} section type is invalid`);
    }
    if (!sectionData.fields || Object.keys(sectionData.fields).length === 0) {
        throw new ValidationError(`Section ${sectionKey} fields are required`);
    }
    if (!sectionData.fieldOrder || sectionData.fieldOrder.length === 0) {
        throw new ValidationError(`Section ${sectionKey} field order is required`);
    }
    if (sectionData.fieldOrder.length !== Object.keys(sectionData.fields).length) {
        throw new ValidationError(`Section ${sectionKey} field order and fields length mismatch`);
    }
    sectionData.fieldOrder.forEach((fieldKey: string) => {
        if (!sectionData.fields[fieldKey]) {
            throw new ValidationError(`Field ${fieldKey} is required`);
        }
        const fieldData = validateField(sectionData.fields[fieldKey]);
        sectionObj.fields[fieldKey] = fieldData;
    });

    sectionObj.fieldOrder = deepCopy(sectionData.fieldOrder);
    sectionObj.key = sectionKey;
    sectionObj.sectiontype = sectionData.sectiontype;
    sectionObj.label = sectionData.label;
    return sectionObj;
}

export const validateTemplate = (template: any, type: string = 'new') => {
    const newTemplateObj: TemplateSchema = {
        label: '',
        sections: {},
        sectionOrder: [],
    }

       if (!template) {
        throw new NotFoundError('Template not found');
    }
    if (type === TEMPLATE_TYPES.NEW && !template.id) {
        throw new ValidationError('Template id is required for new template');
    }
    if (!template.sections || Object.keys(template.sections).length === 0) {
        throw new ValidationError('Template sections are required');
    }
    if (!template.sectionOrder || template.sectionOrder.length === 0) {
        throw new ValidationError('Template section order is required');
    }
    if (template.sectionOrder.length !== Object.keys(template.sections).length) {
        throw new ValidationError('Template section order and sections length mismatch');
    }
    template.sectionOrder.forEach((sectionKey: string) => {
        if (!template.sections[sectionKey]) {
            throw new ValidationError(`Section ${sectionKey} is required`);
        }
        const validatedSectionData = validateSection(template.sections[sectionKey], sectionKey);
        newTemplateObj.sections[sectionKey] = validatedSectionData;
    })
    newTemplateObj.sectionOrder = deepCopy(template.sectionOrder);
    newTemplateObj.label = template.label;
    return newTemplateObj;
}

export const getTemplateForView = async (id: number, _options = {}, _auth?: TokenPayload) => {
    if (!id) {
        throw new ValidationError('Template id is required');
    }
    const template = await templateRepository.findByIdForView(id);
    if (!template) {
        throw new NotFoundError('Template not found');
    }
    return template;
}