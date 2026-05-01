export const REGEX_MAPPING = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    // name: /^[a-zA-Z]+$/,
};

export const modelMapping = {
    USER: 'user',
    SUPPLIER: 'supplier',
    RFP: 'rfp',
};

export const METHODS = {
    SUBMIT: 'submit',
    SAVE: 'save',
    INVITE: 'invite',
    ACCEPT: 'accept',
    REJECT: 'reject',
};

export const ACTIONS = {
    CREATE: 'create',
    EDIT: 'edit',
    DElETE: 'delete',
    CANCEL: 'cancel'
}

export const TEMPLATE_TYPES = {
    NEW: 'new',
    TRANSACTION: 'transaction',
}

export const SECTION_TYPES = {
    FORM: 'form',
    TABLE: 'table',
}

export const FIELD_TYPES = {
    TEXT: 'text',
    NUMBER: 'number',
    DATE: 'date',
    BOOLEAN: 'boolean',
    SELECT: 'select',
    MULTISELECT: 'multiselect',
    RADIO: 'radio',
    CHECKBOX: 'checkbox',
    DATALOOKUP: 'dataLookup',
    FORMULA: 'formula',
}