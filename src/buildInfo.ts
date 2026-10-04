import { appEnvironment } from './lib/firebase'

const rawSha = String(import.meta.env.VITE_BUILD_SHA || '').trim()
const rawRun = String(import.meta.env.VITE_BUILD_RUN || '').trim()

export const buildInfo = {
  environment: appEnvironment,
  run: rawRun || 'local',
  sha: rawSha || 'local',
  shortSha: rawSha ? rawSha.slice(0, 7) : 'local',
}

export const buildLabel = rawRun
  ? `build #${rawRun} · ${buildInfo.shortSha}`
  : `build local · ${buildInfo.shortSha}`
