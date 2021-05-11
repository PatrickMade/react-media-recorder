import {Dispatch, SetStateAction, useCallback, useEffect, useRef, useState} from "react";
import AudioRecorder from 'audio-recorder-polyfill';

window.MediaRecorder = AudioRecorder;

type ReactMediaRecorderHook = {
	error: string;
	muteAudio: () => void;
	unMuteAudio: () => void;
	startRecording: () => void;
	pauseRecording: () => void;
	resumeRecording: () => void;
	stopRecording: () => void;
	mediaBlobUrl?: string;
	setMediaBlobUrl?: Dispatch<SetStateAction<string | undefined>>;
	mediaBlob?: Blob;
	setMediaBlob?: Dispatch<SetStateAction<Blob | undefined>>;
	status: StatusMessages;
	isAudioMuted: boolean;
	previewStream: MediaStream | null;
};

type ReactMediaRecorderProps = {
	audio?: boolean | MediaTrackConstraints;
	video?: boolean | MediaTrackConstraints;
	screen?: boolean;
	onStop?: (blobUrl: string) => void;
	blobPropertyBag?: BlobPropertyBag;
	mediaRecorderOptions?: MediaRecorderOptions | null;
};

type StatusMessages =
	| "media_aborted"
	| "permission_denied"
	| "no_specified_media_found"
	| "media_in_use"
	| "invalid_media_constraints"
	| "no_constraints"
	| "recorder_error"
	| "idle"
	| "acquiring_media"
	| "delayed_start"
	| "recording"
	| "stopping"
	| "stopped";

enum RecorderErrors {
	AbortError = "media_aborted",
	NotAllowedError = "permission_denied",
	NotFoundError = "no_specified_media_found",
	NotReadableError = "media_in_use",
	OverconstrainedError = "invalid_media_constraints",
	TypeError = "no_constraints",
	NONE = "",
	NO_RECORDER = "recorder_error"
}


export const useReactMediaRecorder = ({
										  audio = true,
										  video = false,
										  onStop = () => null,
										  blobPropertyBag,
										  screen = false,
										  mediaRecorderOptions = null
									  }: ReactMediaRecorderProps): ReactMediaRecorderHook => {
	const mediaRecorder = useRef<MediaRecorder | null>(null);
	const mediaChunks = useRef<Blob[]>([]);
	const mediaStream = useRef<MediaStream | null>(null);
	const [status, setStatus] = useState<StatusMessages>("idle");
	const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
	const [mediaBlobUrl, setMediaBlobUrl] = useState<string>();
	const [mediaBlob, setMediaBlob] = useState<Blob>();
	const [error, setError] = useState<keyof typeof RecorderErrors>("NONE");

	const getMediaStream = useCallback(async () => {
		setStatus("acquiring_media");
		const requiredMedia: MediaStreamConstraints = {
			audio: typeof audio === "boolean" ? audio : audio,
			video: typeof video === "boolean" ? video : video
		};
		try {
			if (screen) {
				//@ts-ignore
				const stream = (await window.navigator.mediaDevices.getDisplayMedia({
					video: video || true
				})) as MediaStream;
				if (audio) {
					const audioStream = await window.navigator.mediaDevices.getUserMedia({
						audio
					});

					audioStream
						.getAudioTracks()
						.forEach(audioTrack => stream.addTrack(audioTrack));
				}
				mediaStream.current = stream;
			} else {
				console.log(requiredMedia);
				mediaStream.current = await window.navigator.mediaDevices.getUserMedia(
					requiredMedia
				);
				mediaRecorder.current = new MediaRecorder(mediaStream.current);
				mediaRecorder.current?.addEventListener('dataavailable', onRecordingActive);
				mediaRecorder.current?.addEventListener('stop', onRecordingStop);
				mediaRecorder.current?.addEventListener('error', () => {
					setError("NO_RECORDER");
					setStatus("idle");
				});

				console.log(mediaRecorder.current);
			}
			setStatus("idle");
		} catch (error) {
			setError(error.name);
			setStatus("idle");
			console.log(error);
		}
	}, [audio, video, screen]);

	useEffect(() => {
		if (screen) {
			//@ts-ignore
			if (!window.navigator.mediaDevices.getDisplayMedia) {
				throw new Error("This browser doesn't support screen capturing");
			}
		}

		const checkConstraints = (mediaType: MediaTrackConstraints) => {
			const supportedMediaConstraints = navigator.mediaDevices.getSupportedConstraints();
			const unSupportedConstraints = Object.keys(mediaType).filter(
				constraint =>
					!(supportedMediaConstraints as { [key: string]: any })[constraint]
			);

			if (unSupportedConstraints.length > 0) {
				console.error(
					`The constraints ${unSupportedConstraints.join(
						","
					)} doesn't support on this browser. Please check your ReactMediaRecorder component.`
				);
			}
		};

		if (typeof audio === "object") {
			checkConstraints(audio);
		}
		if (typeof video === "object") {
			checkConstraints(video);
		}

		if (mediaRecorderOptions && mediaRecorderOptions.mimeType) {
			console.log(mediaRecorderOptions.mimeType);
			if (!MediaRecorder.isTypeSupported(mediaRecorderOptions.mimeType)) {
				console.error(
					`The specified MIME type you supplied for MediaRecorder doesn't support this browser`
				);
			}
		}

		async function loadStream() {
			await getMediaStream();
		}

		if (!mediaStream.current) {
			loadStream();
		}
	}, [audio, screen, video, getMediaStream, mediaRecorderOptions]);

	// Media Recorder Handlers
	const startRecording = async () => {
		mediaChunks.current = [];
		setError("NONE");
		console.log(mediaStream.current);
		if (!mediaStream.current) {
			await getMediaStream();
		}
		if (mediaStream.current) {
			mediaRecorder.current?.start();
			setStatus("recording");
		}
	};

	const onRecordingActive = ({data}: BlobEvent) => {
		console.log(data);
		console.log(mediaChunks.current);
		mediaChunks.current.push(data);
		console.log(mediaChunks.current);
	};

	const onRecordingStop = () => {
		const blobProperty: BlobPropertyBag =
			MediaRecorder.prototype.mimeType || video ? {type: "video/mp4"} : {type: "audio/wav"};
		console.log(blobProperty);
		const blob = new Blob(mediaChunks.current, blobProperty);
		console.log(blob);
		const url = URL.createObjectURL(blob);
		console.log(url);
		setStatus("stopped");
		setMediaBlob(blob);
		setMediaBlobUrl(url);
		onStop(url);

	};

	const muteAudio = (mute: boolean) => {
		setIsAudioMuted(mute);
		if (mediaStream.current) {
			mediaStream.current
				.getAudioTracks()
				.forEach(audioTrack => (audioTrack.enabled = !mute));
		}
	};

	const pauseRecording = () => {
		if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
			mediaRecorder.current.pause();
		}
	};
	const resumeRecording = () => {
		if (mediaRecorder.current && mediaRecorder.current.state === "paused") {
			mediaRecorder.current.resume();
		}
	};

	const stopRecording = () => {
		console.log(mediaRecorder);
		if (mediaRecorder.current) {
			setStatus("stopping");
			mediaRecorder.current.stop();
		}
	};

	return {
		error: RecorderErrors[error],
		muteAudio: () => muteAudio(true),
		unMuteAudio: () => muteAudio(false),
		startRecording,
		pauseRecording,
		resumeRecording,
		stopRecording,
		mediaBlob,
		setMediaBlob,
		mediaBlobUrl,
		setMediaBlobUrl,
		status,
		isAudioMuted,
		previewStream: mediaStream.current
			? new MediaStream(mediaStream.current.getVideoTracks())
			: null
	};
};