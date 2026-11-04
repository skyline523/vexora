import { theme, type ThemeConfig } from 'antd';

export const vexoraAntdTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#3d8bfd',
    colorSuccess: '#2fbf71',
    colorError: '#ef5b5b',
    colorInfo: '#3d8bfd',
    colorWarning: '#e6b450',
    colorBgBase: '#070b10',
    colorBgContainer: '#0d131b',
    colorBgElevated: '#121a24',
    colorBorder: '#223044',
    colorBorderSecondary: '#1a2533',
    colorText: '#e7eef8',
    colorTextSecondary: '#9aabc2',
    colorTextTertiary: '#6e829b',
    borderRadius: 2,
    fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
    fontSize: 13,
    controlHeight: 28,
  },
  components: {
    Button: {
      borderRadius: 2,
      controlHeight: 28,
      paddingInline: 10,
    },
    Segmented: {
      trackBg: '#121a24',
      itemSelectedBg: '#1d2a3b',
      itemSelectedColor: '#e7eef8',
      borderRadius: 2,
      controlHeight: 28,
    },
    Select: {
      borderRadius: 2,
      controlHeight: 28,
    },
    Input: {
      borderRadius: 2,
      controlHeight: 28,
    },
  },
};
