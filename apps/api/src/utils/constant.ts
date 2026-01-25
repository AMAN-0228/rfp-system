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