import {Capacitor, registerPlugin, type PluginListenerHandle} from '@capacitor/core';
import type {EditorDraft, Entry} from './types';

export const separateEditor = Capacitor.getPlatform() === 'android';
export const isEditorScreen =
  separateEditor && new URLSearchParams(location.search).get('screen') === 'editor';
export type EditorLaunch = {entry?: Entry; draft?: EditorDraft; tab?: 'scan' | 'history'};
export const EditorScreen = registerPlugin<{
  open: (options: {entry?: Entry}) => Promise<{tab: 'scan' | 'history'}>;
  launchData: () => Promise<EditorLaunch>;
  close: (options: {tab: 'scan' | 'history'; draft?: EditorDraft}) => Promise<void>;
  addListener: (event: 'opened', listener: (data: {entry?: Entry}) => void) => Promise<PluginListenerHandle>;
}>('EditorScreen');
