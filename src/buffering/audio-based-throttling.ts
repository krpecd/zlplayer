import EventEmitter from "../event/eventemitter";
import { Events, EventTypes } from '../event/events';
import BufferingStrategy from "./buffering-strategy";

type AudioBasedThrottlingOptions = {
  delay?: number,
  emitFirstFrameOnly?: boolean
};

export default class AudioBasedThrottling extends BufferingStrategy{
  private emitter: EventEmitter | null = null;
  private bufferingEnabled: boolean = true;
  private options: Required<AudioBasedThrottlingOptions>;
  private firstAACFrame: boolean = true;

  private readonly onH264ParsedHandler = this.onH264Parsed.bind(this);
  private readonly onAACParsedHandler = this.onAACParsed.bind(this);
  private readonly onMPEG2VideoParsedHandler = this.onMPEG2VideoParsed.bind(this);
  private readonly onAudioTimestampTickHandler = this.onAudioTimestampTick.bind(this);
  private readonly onAudioTimestampEnabledHandler = this.onAudioTimestampEnabled.bind(this);
  private readonly onAudioTimestampDisabledHandler = this.onAudioTimestampDisabled.bind(this);

  private h264Queue: Events[typeof EventTypes.H264_PARSED][] = [];
  private mpeg2videoQueue: Events[typeof EventTypes.MPEG2VIDEO_PARSED][] = [];

  static isSupported () {
    return true;
  }

  public constructor(options?: AudioBasedThrottlingOptions) {
    super();
    this.options = {
      delay: Math.max(options?.delay ?? 0, 0),
      emitFirstFrameOnly: options?.emitFirstFrameOnly ?? false
    }
  }

  public setEmitter(emitter: EventEmitter) {
    if (this.emitter) {
      this.emitter.off(EventTypes.H264_PARSED, this.onH264ParsedHandler);
      this.emitter.off(EventTypes.AAC_PARSED, this.onAACParsedHandler);
      this.emitter.off(EventTypes.MPEG2VIDEO_PARSED, this.onMPEG2VideoParsedHandler);
      this.emitter.off(EventTypes.AUDIO_TIMESTAMP_TICK, this.onAudioTimestampTickHandler);
      this.emitter.off(EventTypes.AUDIO_TIMESTAMP_ENABLED, this.onAudioTimestampEnabledHandler);
      this.emitter.off(EventTypes.AUDIO_TIMESTAMP_DISABLED, this.onAudioTimestampDisabledHandler);
    }

    this.emitter = emitter;
    this.emitter.on(EventTypes.H264_PARSED, this.onH264ParsedHandler);
    this.emitter.on(EventTypes.AAC_PARSED, this.onAACParsedHandler);
    this.emitter.on(EventTypes.MPEG2VIDEO_PARSED, this.onMPEG2VideoParsedHandler);
    this.emitter.on(EventTypes.AUDIO_TIMESTAMP_TICK, this.onAudioTimestampTickHandler);
    this.emitter.on(EventTypes.AUDIO_TIMESTAMP_ENABLED, this.onAudioTimestampEnabledHandler);
    this.emitter.on(EventTypes.AUDIO_TIMESTAMP_DISABLED, this.onAudioTimestampDisabledHandler);
  }

  public abort() {
    this.h264Queue = [];
    this.mpeg2videoQueue = [];
  }

  private onH264Parsed(payload: Events[typeof EventTypes.H264_PARSED]) {
    if (this.bufferingEnabled) {
      this.h264Queue.push(payload);
    } else {
      this.emitter?.emit(EventTypes.H264_EMITTED, {
        ... payload,
        event: EventTypes.H264_EMITTED
      });
    }
  }

  private onAACParsed(payload: Events[typeof EventTypes.AAC_PARSED]) {
    if (!this.firstAACFrame) { return; }
    this.firstAACFrame = false;

    if (this.options.delay === 0){
      this.emitter?.emit(EventTypes.AAC_EMITTED, { ... payload, event: EventTypes.AAC_EMITTED });
    } else {
      setTimeout(() => {
        this.emitter?.emit(EventTypes.AAC_EMITTED, { 
          ... payload,
          event: EventTypes.AAC_EMITTED
        });
      }, this.options.delay);
    }
  }
  
  private onMPEG2VideoParsed(payload: Events[typeof EventTypes.MPEG2VIDEO_PARSED]) {
    if (this.bufferingEnabled) {
      this.mpeg2videoQueue.push(payload);
    } else {
      this.emitter?.emit(EventTypes.MPEG2VIDEO_EMITTED, {
        ... payload,
        event: EventTypes.MPEG2VIDEO_EMITTED
      });
    }
  }

  private onAudioTimestampTick(payload: Events[typeof EventTypes.AUDIO_TIMESTAMP_TICK]) {
    let h264Emitted = false;
    this.h264Queue = this.h264Queue.filter((h264) => {
      if (payload.timestamp >= h264.dts_timestamp) {
        if (!this.options.emitFirstFrameOnly || !h264Emitted) {
          this.emitter?.emit(EventTypes.H264_EMITTED, {
            ... h264,
            event: EventTypes.H264_EMITTED
          });
          h264Emitted = false;
          return false;
        } else {
          return true;
        }
      } else {
        return true;
      }
    });

    let mpeg2Emitted = false;
    this.mpeg2videoQueue = this.mpeg2videoQueue.filter((mpeg2video) => {
      if (payload.timestamp >= mpeg2video.dts_timestamp) {
        if (!this.options.emitFirstFrameOnly || !mpeg2Emitted) {
          this.emitter?.emit(EventTypes.MPEG2VIDEO_EMITTED, {
            ... mpeg2video,
            event: EventTypes.MPEG2VIDEO_EMITTED
          });
          mpeg2Emitted = true;
          return false;
        } else {
          return true;
        }
      } else {
        return true;
      }
    });
  }

  private onAudioTimestampEnabled(payload: Events[typeof EventTypes.AUDIO_TIMESTAMP_ENABLED]) {
    this.bufferingEnabled = true;
  }

  private onAudioTimestampDisabled(payload: Events[typeof EventTypes.AUDIO_TIMESTAMP_DISABLED]) {
    this.bufferingEnabled = false;
  }
};