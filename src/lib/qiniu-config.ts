import { getThemeSettings } from './theme-settings';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const getQiniuConfig = () => {
  const settings = getThemeSettings();
  const qiniuConfig = settings.settings.ui.imageProvider?.qiniu;

  return {
    accessKey: isRecord(qiniuConfig) && typeof qiniuConfig.accessKey === 'string' ? qiniuConfig.accessKey : '',
    secretKey: isRecord(qiniuConfig) && typeof qiniuConfig.secretKey === 'string' ? qiniuConfig.secretKey : '',
    bucket: isRecord(qiniuConfig) && typeof qiniuConfig.bucket === 'string' ? qiniuConfig.bucket : '',
    domain: isRecord(qiniuConfig) && typeof qiniuConfig.domain === 'string' ? qiniuConfig.domain : '',
    path: isRecord(qiniuConfig) && typeof qiniuConfig.path === 'string' ? qiniuConfig.path : '/'
  };
};

export const isQiniuConfigured = () => {
  const config = getQiniuConfig();
  return !!(config.accessKey && config.secretKey && config.bucket && config.domain);
};