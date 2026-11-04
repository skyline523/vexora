import { ConfigProvider, App as AntApp } from 'antd';
import { TerminalShell } from './layout/TerminalShell';
import { vexoraAntdTheme } from './theme/antdTheme';

export function App() {
  return (
    <ConfigProvider theme={vexoraAntdTheme}>
      <AntApp style={{ height: '100%' }}>
        <TerminalShell />
      </AntApp>
    </ConfigProvider>
  );
}
