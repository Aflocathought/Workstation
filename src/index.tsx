/* @refresh reload */
import { render } from "solid-js/web";
import App from "./App";
import Spectrum from "./Tools/Spectrum/Spectrum";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { repository } from "./core/Repository";
// Shoelace theme
import "@shoelace-style/shoelace/dist/themes/light.css";

function bootstrap() {
	// 根据 URL 参数渲染不同页面（/index.html?spectrum=1 来自后端创建窗口时设定）
		const url = new URL(window.location.href);
		const isSpectrum = url.searchParams.has("spectrum");
		// 兼容：若通过窗口 label 判断到是频谱窗口，也走频谱渲染
		const label = (() => {
			try {
				return getCurrentWebviewWindow().label;
			} catch {
				return "";
			}
		})();
		const spectrumByLabel = label.startsWith("spectrum");
		if (isSpectrum || spectrumByLabel) {
		render(() => <Spectrum />, document.getElementById("root") as HTMLElement);
	} else {
		render(() => <App />, document.getElementById("root") as HTMLElement);
	}

		if (import.meta.env.DEV) {
			(window as typeof window & { repository?: typeof repository }).repository = repository;
		}
}

bootstrap();
