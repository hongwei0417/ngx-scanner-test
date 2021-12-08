import { CameraService } from './../core/camera.service';
import { DeviceType } from './../deviceType';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import {
  BrowserCodeReader,
  BrowserDatamatrixCodeReader,
  BrowserMultiFormatReader,
} from '@zxing/browser';
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  Result,
  ResultPoint,
  RGBLuminanceSource,
} from '@zxing/library';
import { BehaviorSubject, fromEvent, Observable, of, Subject } from 'rxjs';
import {
  catchError,
  debounceTime,
  filter,
  switchMap,
  tap,
} from 'rxjs/operators';
import { AppInfoDialogComponent } from '../app-info-dialog/app-info-dialog.component';
import { getDeviceType } from '../deviceType';
import { FormatsDialogComponent } from '../formats-dialog/formats-dialog.component';
import interact from 'interactjs';
import { MatSliderChange } from '@angular/material/slider';
import { NgOpenCVService, OpenCVLoadResult } from 'ng-open-cv';

@Component({
  selector: 'app-zxing-browser',
  templateUrl: './zxing-browser.component.html',
  styleUrls: ['./zxing-browser.component.scss'],
})
export class ZxingBrowserComponent implements OnInit, AfterViewInit {
  @ViewChild('video') video: ElementRef<HTMLVideoElement>;
  @ViewChild('mainPointers') mainPointers: ElementRef<HTMLCanvasElement>;
  @ViewChild('snapshotCanvas') snapshotCanvas: ElementRef<HTMLCanvasElement>;
  @ViewChild('snapshotCanvas2') snapshotCanvas2: ElementRef<HTMLCanvasElement>;
  @ViewChild('barcodeCanvas') barcodeCanvas: ElementRef<HTMLCanvasElement>;
  @ViewChild('snapshotPointers')
  snapshotPointers: ElementRef<HTMLCanvasElement>;
  @ViewChild('scannerContainer') scannerContainer: ElementRef<HTMLDivElement>;
  @ViewChild('scannerArea') scannerArea: ElementRef<HTMLDivElement>;
  @ViewChild('snapshotContainer') snapshotContainer: ElementRef<HTMLDivElement>;
  @ViewChild('dataMatrixTemplateImage')
  dataMatrixTemplateImage: ElementRef<HTMLImageElement>;

  availableDevices: MediaDeviceInfo[] = [];
  currentDevice: MediaDeviceInfo;

  private _hints: Map<DecodeHintType, any> | null = new Map<
    DecodeHintType,
    any
  >();

  resultPoints$ = new BehaviorSubject<ResultPoint[]>([]);
  // videoLoaded$: Observable<Event>;
  // videoClick$: Observable<Event>;
  // windowResized$: Observable<Event>;
  // videoResized$: Observable<Event>;
  userMedia$ = new Subject();
  codeReader: BrowserMultiFormatReader;
  active = false;

  formatsEnabled: BarcodeFormat[] = [
    // BarcodeFormat.CODE_128,
    BarcodeFormat.DATA_MATRIX,
    // BarcodeFormat.EAN_13,
    // BarcodeFormat.QR_CODE,
  ];

  stream = null;
  hasDevices: boolean;
  hasPermission: boolean;
  constrains: any;
  result: any;
  message: any;
  error: any;
  zoomRatio = 1;
  frameCount = 0;
  scanPeriod = 30;
  thresHoldValue = 0;
  blurValue = 10;

  enableGrayscale = true;
  enableEqualization = false;
  enableInvertColor = true;
  enableThreshold = true;
  enableBlur = false;

  availableScanMode = ['auto', '1D', '2D'];
  currentScanMode = this.availableScanMode[0];

  get hints() {
    return this._hints;
  }
  set hints(hints: Map<DecodeHintType, any>) {
    this._hints = hints;
    this.codeReader?.setHints(this._hints);
  }

  get formats(): BarcodeFormat[] {
    return this.hints.get(DecodeHintType.POSSIBLE_FORMATS);
  }
  set formats(input: BarcodeFormat[]) {
    if (typeof input === 'string') {
      throw new Error(
        'Invalid formats, make sure the [formats] input is a binding.'
      );
    }

    const getBarcodeFormatOrFail = (
      format: string | BarcodeFormat
    ): BarcodeFormat => {
      return typeof format === 'string'
        ? BarcodeFormat[format.trim().toUpperCase()]
        : format;
    };

    const formats = input.map((f) => getBarcodeFormatOrFail(f));

    const hints = this.hints;

    hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);

    this.hints = hints;
  }

  get cropData() {
    const { width, height, offsetWidth, offsetHeight } =
      this.mainPointers.nativeElement;
    const widthRatio = offsetWidth / width;
    const heightRatio = offsetHeight / height;
    const cropWidth =
      this.scannerArea.nativeElement.offsetWidth / widthRatio / this.zoomRatio;
    const cropHeight =
      this.scannerArea.nativeElement.offsetHeight /
      heightRatio /
      this.zoomRatio;
    const x0 = width / 2 - cropWidth / 2;
    const y0 = height / 2 - cropHeight / 2;
    return {
      x0,
      y0,
      cropWidth,
      cropHeight,
    };
  }

  constructor(
    private readonly _dialog: MatDialog,
    private ngOpenCVService: NgOpenCVService,
    private cameraService: CameraService
  ) {}

  ngOnInit(): void {
    this.cameraService.availableDevices$.subscribe((availableDevices) => {
      this.availableDevices = availableDevices;
    });
    this.cameraService.currentDevice$.subscribe((currentDevice) => {
      this.currentDevice = currentDevice;
    });
    // this.ngOpenCVService.isReady$
    //   .pipe(filter((result: OpenCVLoadResult) => result.ready))
    //   .subscribe(() => console.log(cv));
    // this.userMedia$.subscribe(this.loadStream.bind(this));
    // this.resultPoints$.subscribe(this.drawResult.bind(this));
  }

  ngAfterViewInit(): void {
    this.cameraService.init(this.video);
    // this.videoLoaded$ = fromEvent(this.video.nativeElement, 'loadedmetadata');
    // this.videoResized$ = fromEvent(this.video.nativeElement, 'resize');
    // this.windowResized$ = fromEvent(window, 'resize');
    // this.videoClick$ = fromEvent(this.scannerContainer.nativeElement, 'click');
    // this.initVideo();
    // this.initAnalyzer();
    // this.initInteract();
  }

  onDeviceSelectChange(selected: string) {
    this.cameraService.changeDevice(
      this.availableDevices.find((x) => x.deviceId === selected)
    );
  }

  // initVideo() {
  //   this.setScannerArea('auto');
  //   this.videoLoaded$.subscribe(this.loadCanvas.bind(this));
  //   this.videoClick$.subscribe(this.onVideoClick.bind(this));
  //   this.windowResized$.subscribe(this.resizeWindow.bind(this));
  //   this.videoResized$.subscribe(this.resizeWindow.bind(this));
  //   this.userMedia$.next();
  // }

  // initAnalyzer() {
  //   this.formats = this.formatsEnabled;
  //   this.codeReader = new BrowserMultiFormatReader();
  //   // this.codeReader = new BrowserMultiFormatReader(this.hints);
  //   // this.codeReader = new BrowserDatamatrixCodeReader();
  // }

  // loadCanvas() {
  //   try {
  //     this.resizeWindow();
  //     this.draw();
  //   } catch (error) {
  //     this.error = error;
  //   }
  // }

  resizeWindow() {
    this.resetSetting();
    this.resizeVideo();
    this.resizeSnapShot();
  }

  resizeVideo() {
    const { videoWidth, videoHeight } = this.video.nativeElement;
    const { offsetWidth, offsetHeight } = document.body;
    const videoRatio = videoHeight / videoWidth;
    const currentRatio = offsetHeight / offsetWidth;
    let maxWidth, maxHeight;

    if (currentRatio > videoRatio) {
      maxWidth = offsetWidth;
      maxHeight = offsetWidth * videoRatio;
    } else {
      maxWidth = offsetHeight / videoRatio;
      maxHeight = offsetHeight;
    }

    this.mainPointers.nativeElement.width = videoWidth;
    this.mainPointers.nativeElement.height = videoHeight;
    this.scannerContainer.nativeElement.style.maxWidth = `${maxWidth}px`;
    this.scannerContainer.nativeElement.style.maxHeight = `${maxHeight}px`;
  }

  resizeSnapShot() {
    const { cropWidth, cropHeight } = this.cropData;
    const SNAPSHOT_RATIO = 0.3;
    const snapshotCanvas = this.snapshotCanvas.nativeElement;
    const snapshotCanvas2 = this.snapshotCanvas2.nativeElement;
    const snapshotPointers = this.snapshotPointers.nativeElement;
    const snapshotContainer = this.snapshotContainer.nativeElement;
    snapshotCanvas.width = cropWidth;
    snapshotCanvas.height = cropHeight;
    snapshotCanvas2.width = cropWidth;
    snapshotCanvas2.height = cropHeight;
    snapshotPointers.width = cropWidth;
    snapshotPointers.height = cropHeight;
    snapshotContainer.style.width = `${
      this.scannerArea.nativeElement.offsetWidth * SNAPSHOT_RATIO
    }px`;
    snapshotContainer.style.height = `${
      this.scannerArea.nativeElement.offsetHeight * SNAPSHOT_RATIO
    }px`;
  }

  resetSetting() {
    this.zoomRatio = 1;
    this.video.nativeElement.style.transform = `scale(1)`;
    this.mainPointers.nativeElement.style.transform = `scale(1)`;
  }

  onVideoClick() {
    if (this.video.nativeElement.paused) {
      this.video.nativeElement.play();
    } else {
      this.video.nativeElement.pause();
    }
  }

  setScannerArea(mode: string) {
    const getAspect = {
      auto: () => {
        return { width: '320px', height: '320px' };
      },
      '1D': () => {
        return { width: '800px', height: '200px' };
      },
      '2D': () => {
        return { width: '500px', height: '500px' };
      },
    };
    const { width, height } = getAspect[mode]();
    this.scannerArea.nativeElement.style.width = width;
    this.scannerArea.nativeElement.style.height = height;
  }

  onScanModeSelectChange(selected: string) {
    this.setScannerArea(selected);
    this.resizeWindow();
  }

  openFormatsDialog() {
    const data = {
      formatsEnabled: this.formatsEnabled,
    };

    this._dialog
      .open(FormatsDialogComponent, { data })
      .afterClosed()
      .subscribe((x) => {
        if (x) {
          console.log(x);
          this.formatsEnabled = x;
          this.formats = this.formatsEnabled;
        }
      });
  }

  openInfoDialog() {
    const data = {
      hasDevices: this.hasDevices,
      hasPermission: this.hasPermission,
    };

    this._dialog.open(AppInfoDialogComponent, { data });
  }

  onEnableImageFilter(type: string) {
    const action = {
      grayScale: () => {
        this.enableGrayscale = !this.enableGrayscale;
      },
      equalization: () => {
        this.enableEqualization = !this.enableEqualization;
      },
      invertColor: () => {
        this.enableInvertColor = !this.enableInvertColor;
      },
      thresHold: () => {
        this.enableThreshold = !this.enableThreshold;
      },
      blur: () => {
        this.enableBlur = !this.enableBlur;
      },
    };
    action[type]();
  }

  clearResult(): void {
    this.result = null;
  }

  clearMessage(): void {
    this.message = null;
  }

  clearError(): void {
    this.error = null;
  }

  test = 0;

  // draw() {
  //   if (!this.active) return;

  //   requestAnimationFrame(this.draw.bind(this));

  //   this.message = ++this.test;
  //   this.captureImage();

  //   if (++this.frameCount === this.scanPeriod) {
  //     this.frameCount = 0;
  //   } else {
  //     return;
  //   }

  //   this.decodeImage();
  // }

  // captureImage() {
  //   const { x0, y0, cropWidth, cropHeight } = this.cropData;
  //   const snapShotCtx = this.snapshotCanvas.nativeElement.getContext('2d');
  //   const mask = this.dataMatrixTemplateImage.nativeElement;
  //   snapShotCtx.drawImage(
  //     this.video.nativeElement,
  //     x0,
  //     y0,
  //     cropWidth,
  //     cropHeight,
  //     0,
  //     0,
  //     cropWidth * this.zoomRatio,
  //     cropHeight * this.zoomRatio
  //   );

  //   // snapShotCtx.drawImage(mask, 0, 0);
  //   // this.openCVImageFilter();
  //   // this.nativeImageFilter();
  // }

  // decodeImage() {
  //   try {
  //     const result = this.codeReader.decodeFromCanvas(
  //       this.barcodeCanvas.nativeElement
  //       // this.snapshotCanvas.nativeElement
  //       // this.snapshotCanvas2.nativeElement
  //     );
  //     this.result = result.getText();
  //     this.resultPoints$.next(result.getResultPoints());
  //     console.log(result);
  //   } catch (error) {
  //     console.log('Not Found Result');
  //     this.clearPoints();
  //   }
  // }

  // drawResult(resultPoints: ResultPoint[]): void {
  //   if (resultPoints.length === 0) return;

  //   const mainResult = this.mainPointers.nativeElement;
  //   const snapshotResult = this.snapshotPointers.nativeElement;
  //   const { x0, y0 } = this.cropData;

  //   this.drawPoints(
  //     mainResult,
  //     resultPoints.map((p) => {
  //       return {
  //         x: x0 + p.getX() / this.zoomRatio,
  //         y: y0 + p.getY() / this.zoomRatio,
  //       };
  //     })
  //   );
  //   this.drawPoints(
  //     snapshotResult,
  //     resultPoints.map((p) => {
  //       return { x: p.getX(), y: p.getY() };
  //     })
  //   );
  // }

  // drawPoints(canvas: HTMLCanvasElement, points: any = []): void {
  //   // set canvas
  //   const ctx = canvas.getContext('2d');
  //   ctx.clearRect(0, 0, canvas.width, canvas.height);
  //   ctx.lineWidth = 4;
  //   ctx.strokeStyle = 'red';

  //   // draw points
  //   ctx.beginPath();
  //   ctx.moveTo(points[0].x, points[0].y);
  //   points.slice(1).forEach((p) => {
  //     ctx.lineTo(p.x, p.y);
  //   });
  //   ctx.closePath();
  //   ctx.stroke();
  // }

  // clearPoints(): void {
  //   const mainResult = this.mainPointers.nativeElement;
  //   const snapshotResult = this.snapshotPointers.nativeElement;

  //   const pointersCtx = mainResult.getContext('2d');
  //   const resultCtx = snapshotResult.getContext('2d');

  //   pointersCtx.clearRect(0, 0, mainResult.width, mainResult.height);
  //   resultCtx.clearRect(0, 0, snapshotResult.width, snapshotResult.height);
  // }

  // openCVImageFilter() {
  //   try {
  //     // for (let i = 1; i <= 10; i++) {
  //     //   const image = this.dataMatrixTemplateImage.nativeElement;
  //     //   image.style.width = `${100 + 20 * i}px`;
  //     //   image.style.height = `${100 + 20 * i}px`;
  //     //   this.matchOneTemplate();
  //     // }
  //     // this.matchMultipleTemplate();
  //     this.contours();
  //   } catch (error) {
  //     console.error(error);
  //     this.stop();
  //   }
  // }

  // nativeImageFilter() {
  //   const { x0, y0, cropWidth, cropHeight } = this.cropData;
  //   const snapShotCtx = this.snapshotCanvas.nativeElement.getContext('2d');
  //   const imageData = snapShotCtx.getImageData(
  //     0,
  //     0,
  //     cropWidth * this.zoomRatio,
  //     cropHeight * this.zoomRatio
  //   );

  //   if (this.enableGrayscale) this.grayscale(imageData.data);
  //   if (this.enableEqualization) this.equalization(imageData.data);
  //   if (this.enableInvertColor) this.invertColors(imageData.data);
  //   if (this.enableBlur) this.blur(imageData, this.blurValue, 1);
  //   if (this.enableThreshold) {
  //     this.OTSU(imageData.data, imageData.width * imageData.height);
  //   }
  //   this.thresHold(imageData.data);
  //   snapShotCtx.putImageData(imageData, 0, 0);
  // }

  // initInteract(): void {
  //   interact('.snapshot-container')
  //     .resizable({
  //       // resize from all edges and corners
  //       edges: { left: true, right: true, bottom: true, top: true },

  //       listeners: {
  //         move(event) {
  //           var target = event.target;
  //           var x = parseFloat(target.getAttribute('data-x')) || 0;
  //           var y = parseFloat(target.getAttribute('data-y')) || 0;

  //           // update the element's style
  //           target.style.width = event.rect.width + 'px';
  //           target.style.height = event.rect.height + 'px';

  //           // translate when resizing from top or left edges
  //           x += event.deltaRect.left;
  //           y += event.deltaRect.top;

  //           target.style.transform = `translate(${x}px,${y}px)`;

  //           target.setAttribute('data-x', x);
  //           target.setAttribute('data-y', y);
  //         },
  //       },
  //       modifiers: [
  //         // keep the edges inside the parent
  //         interact.modifiers.restrictEdges({
  //           outer: 'parent',
  //         }),
  //         // minimum size
  //         interact.modifiers.restrictSize({
  //           min: { width: 100, height: 50 },
  //         }),
  //       ],

  //       inertia: true,
  //     })
  //     .draggable({
  //       listeners: { move: dragMoveListener },
  //       inertia: true,
  //       modifiers: [
  //         interact.modifiers.restrictRect({
  //           restriction: 'parent',
  //           endOnly: true,
  //         }),
  //       ],
  //     });

  //   function dragMoveListener(event) {
  //     var target = event.target;
  //     // keep the dragged position in the data-x/data-y attributes
  //     var x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
  //     var y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;

  //     // translate the element
  //     target.style.transform = 'translate(' + x + 'px, ' + y + 'px)';

  //     // update the posiion attributes
  //     target.setAttribute('data-x', x);
  //     target.setAttribute('data-y', y);
  //   }
  // }

  // onZoomChange(change: MatSliderChange): void {
  //   this.video.nativeElement.style.transform = `scale(${change.value})`;
  //   this.mainPointers.nativeElement.style.transform = `scale(${change.value})`;
  //   this.zoomRatio = change.value;
  // }

  // onThresHoldChange(change: MatSliderChange): void {
  //   this.thresHoldValue = change.value;
  // }

  // onBlurChange(change: MatSliderChange): void {
  //   this.blurValue = change.value;
  // }

  // // * 反轉
  // invertColors(data: Uint8ClampedArray): void {
  //   for (var i = 0; i < data.length; i += 4) {
  //     data[i] = 255 - data[i]; // red
  //     data[i + 1] = 255 - data[i + 1]; // green
  //     data[i + 2] = 255 - data[i + 2]; // blue
  //   }
  // }

  // // * 灰階
  // grayscale(data: Uint8ClampedArray): void {
  //   for (var i = 0; i < data.length; i += 4) {
  //     let avg =
  //       data[i] ^
  //       (2.2 * 0.2973 + data[i + 1]) ^
  //       (2.2 * 0.6274 + data[i + 2]) ^
  //       (2.2 * 0.0753) ^
  //       (1 / 2.2); // ? adobe PS algo
  //     // let avg = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
  //     // avg = avg <= 0.0031308 ? 12.92 * avg : (avg ^ (1 / 2.4)) * 1.055 - 0.055;
  //     avg = (data[i] + data[i + 1] + data[i + 2]) / 3;

  //     data[i] = avg; // red
  //     data[i + 1] = avg; // green
  //     data[i + 2] = avg; // blue
  //   }
  // }

  // // * 直方圖均衡化(Histogram Equalization)
  // equalization(data: Uint8ClampedArray) {
  //   let histogram = new Array<number>(255); //每個灰度值出現次數(灰階直方圖)
  //   let CDF = new Array<number>(255); //累積分布函數

  //   //初始化
  //   for (let i = 0; i < 256; i++) {
  //     histogram[i] = 0;
  //     CDF[i] = 0;
  //   }

  //   //統計圖像灰度分布(灰階值方圖)
  //   for (let i = 0; i < data.length; i += 4) {
  //     // 灰階圖像r=g=b，取其中一個就好
  //     let r = data[i];
  //     histogram[r]++;
  //   }

  //   //計算累積分布函數
  //   for (let i = 0; i < 256; i++) {
  //     CDF[i] = i > 0 ? histogram[i] + CDF[i - 1] : histogram[i];
  //   }

  //   //均勻化
  //   for (let i = 0; i < data.length; i += 4) {
  //     let value = Math.round((CDF[data[i]] / CDF[255]) * 255);
  //     data[i] = value; // red
  //     data[i + 1] = value; // green
  //     data[i + 2] = value; // blue
  //   }
  //   // console.log(histogram);
  // }

  // // * 閾值(二值化)
  // thresHold(data: Uint8ClampedArray) {
  //   for (var i = 0; i < data.length; i += 4) {
  //     let r = data[i];
  //     let g = data[i + 1];
  //     let b = data[i + 2];
  //     let value = r <= this.thresHoldValue ? 0 : 255;
  //     data[i] = data[i + 1] = data[i + 2] = value;
  //     // data[i] = data[i] > this.thresHoldValue ? 0 : data[i];
  //     // data[i + 2] = data[i + 2] > this.thresHoldValue ? 0 : data[i] + 2;
  //     // data[i + 1] = data[i + 1] > this.thresHoldValue ? 0 : data[i + 1];
  //     // data[i + 3] = data[i + 3] > this.thresHoldValue ? 0 : data[i + 3];
  //   }
  // }

  // // ! 區域二值化(有問題)
  // areaThreshold(img: ImageData, blockWidth: number, blockHeight: number) {
  //   const width = img.width; // 寬度(pixel)
  //   const height = img.height; // 高度(pixel)
  //   const subWidth = Math.floor(img.width / blockWidth); // 區域寬度
  //   const subHeight = Math.floor(img.height / blockHeight); // 區域高度
  //   const widthSize = width * 4; //  寬度資料數量
  //   const heightSize = height * widthSize; // 高度資料數量

  //   console.log(width, height);
  //   console.log(subWidth, subHeight);
  //   console.log(widthSize, heightSize);

  //   let result = [];
  //   for (let y = 0; y < subHeight + 1; y++) {
  //     const yOffset = y * blockHeight; // y的起始行數
  //     const yStart = yOffset * widthSize; // y的起始位置
  //     for (let yy = 0; yy < blockHeight; yy++) {
  //       // 處理一整行區塊
  //       const yyStart = yStart + yy * widthSize;
  //       if (yyStart < heightSize) {
  //         for (let x = 0; x < subWidth + 1; x++) {
  //           const xOffset = x * blockWidth * 4; // x的起始列數
  //           const xStart = yyStart + xOffset; // x的起始位置
  //           let subResult = [];
  //           // 處理一個區塊
  //           for (let xx = 0; xx < blockWidth * 4; xx += 4) {
  //             let curr = xStart + xx; // 目前資料位置
  //             let max = (yOffset + yy + 1) * widthSize; // 該行最大位置
  //             if (curr < max) {
  //               subResult.push(curr);
  //             }
  //           }
  //           // 紀錄結果
  //           let blockIndex = x + y * (subWidth + 1); // 取得該區塊的編號
  //           if (result[blockIndex]) {
  //             result[blockIndex].push(...subResult);
  //           } else {
  //             result[blockIndex] = subResult;
  //           }
  //         }
  //       }
  //     }
  //   }

  //   // 二值化處理
  //   for (let i = 0; i < result.length; i++) {
  //     const blockData = [];
  //     for (let j = 0; j < result[i].length; j++) {
  //       let index = result[i][j];
  //       blockData.push(img.data[index]);
  //       blockData.push(img.data[index + 1]);
  //       blockData.push(img.data[index + 2]);
  //       blockData.push(img.data[index + 3]);
  //     }
  //     const threshold = this.OTSU(
  //       new Uint8ClampedArray(blockData),
  //       result[i].length
  //     );
  //     console.log(threshold);
  //     for (var j = 0; j < blockData.length; j += 4) {
  //       let r = blockData[i];
  //       let value = r >= threshold ? 255 : 0;
  //       let index = result[i][j / 4];
  //       img.data[index] = img.data[index + 1] = img.data[index + 2] = value;
  //     }
  //   }
  //   console.log(img.data);
  // }

  // // * 一維OTSU(大津演算法)
  // OTSU(data: Uint8ClampedArray | any, size: number) {
  //   let histogram = new Array<number>(255); //每個灰度值出現次數(灰階直方圖)
  //   let pHistogram = new Array<number>(255); //每個灰度值出現比例(機率)
  //   let sumPHistogram = new Array<number>(255); //每個灰度比例之和
  //   let wHistogram = new Array<number>(255); //每個灰度的比例*權重
  //   let sumWHistogram = new Array<number>(255); //每個灰度的比例*權重之和
  //   let temp = 0; //臨時變量
  //   let sigma2Max = 0; //最大類間方差(變異數差)
  //   let threshold = 0; //最好閾值

  //   //初始化
  //   for (let i = 0; i < 256; i++) {
  //     histogram[i] = 0;
  //     pHistogram[i] = 0;
  //     sumPHistogram[i] = 0;
  //     wHistogram[i] = 0;
  //   }

  //   //統計圖像灰度分布(灰階值方圖)
  //   for (let i = 0; i < data.length; i += 4) {
  //     // 灰階圖像r=g=b，取其中一個就好
  //     let r = data[i];
  //     histogram[r]++;
  //   }

  //   //計算每個灰度機率、灰度比例、灰度權重
  //   for (let i = 0; i < 256; i++) {
  //     pHistogram[i] = histogram[i] / size;
  //     wHistogram[i] = i * pHistogram[i];

  //     sumPHistogram[i] =
  //       i > 0 ? pHistogram[i] + sumPHistogram[i - 1] : pHistogram[i];
  //     sumWHistogram[i] =
  //       i > 0 ? wHistogram[i] + sumWHistogram[i - 1] : wHistogram[i];
  //   }

  //   //將區塊分為A、B區域，並從0~255中分別計算OTSU值並找出最大值作為分割閾值
  //   for (let i = 0; i < 256; i++) {
  //     let pA = sumPHistogram[i]; //A區塊機率和
  //     let pB = 1 - pA; //B區塊機率和
  //     let wpA = sumWHistogram[i]; //A區塊機率權重和
  //     let wpB = sumWHistogram[255] - wpA; //B區塊機率權重和
  //     let uA = wpA / pA; //A區塊平均灰度值
  //     let uB = wpB / pB; //B區塊平均灰度值

  //     //計算類間變異數差(OTSU)
  //     temp = pA * pB * Math.pow(uA - uB, 2); //類間方差公式
  //     if (temp > sigma2Max) {
  //       sigma2Max = temp;
  //       threshold = i;
  //     }
  //   }
  //   this.thresHoldValue = threshold;
  //   return threshold;
  // }

  // // * 模糊
  // blur(imageData: ImageData, radius = 10, quality = 1) {
  //   var pixels = imageData.data;
  //   var width = imageData.width;
  //   var height = imageData.height;

  //   var rsum, gsum, bsum, asum, x, y, i, p, p1, p2, yp, yi, yw;
  //   var wm = width - 1;
  //   var hm = height - 1;
  //   var rad1x = radius + 1;
  //   var divx = radius + rad1x;
  //   var rad1y = radius + 1;
  //   var divy = radius + rad1y;
  //   var div2 = 1 / (divx * divy);

  //   var r = [];
  //   var g = [];
  //   var b = [];
  //   var a = [];

  //   var vmin = [];
  //   var vmax = [];

  //   while (quality-- > 0) {
  //     yw = yi = 0;

  //     for (y = 0; y < height; y++) {
  //       rsum = pixels[yw] * rad1x;
  //       gsum = pixels[yw + 1] * rad1x;
  //       bsum = pixels[yw + 2] * rad1x;
  //       asum = pixels[yw + 3] * rad1x;

  //       for (i = 1; i <= radius; i++) {
  //         p = yw + ((i > wm ? wm : i) << 2);
  //         rsum += pixels[p++];
  //         gsum += pixels[p++];
  //         bsum += pixels[p++];
  //         asum += pixels[p];
  //       }

  //       for (x = 0; x < width; x++) {
  //         r[yi] = rsum;
  //         g[yi] = gsum;
  //         b[yi] = bsum;
  //         a[yi] = asum;

  //         if (y == 0) {
  //           vmin[x] = Math.min(x + rad1x, wm) << 2;
  //           vmax[x] = Math.max(x - radius, 0) << 2;
  //         }

  //         p1 = yw + vmin[x];
  //         p2 = yw + vmax[x];

  //         rsum += pixels[p1++] - pixels[p2++];
  //         gsum += pixels[p1++] - pixels[p2++];
  //         bsum += pixels[p1++] - pixels[p2++];
  //         asum += pixels[p1] - pixels[p2];

  //         yi++;
  //       }
  //       yw += width << 2;
  //     }

  //     for (x = 0; x < width; x++) {
  //       yp = x;
  //       rsum = r[yp] * rad1y;
  //       gsum = g[yp] * rad1y;
  //       bsum = b[yp] * rad1y;
  //       asum = a[yp] * rad1y;

  //       for (i = 1; i <= radius; i++) {
  //         yp += i > hm ? 0 : width;
  //         rsum += r[yp];
  //         gsum += g[yp];
  //         bsum += b[yp];
  //         asum += a[yp];
  //       }

  //       yi = x << 2;
  //       for (y = 0; y < height; y++) {
  //         pixels[yi] = (rsum * div2 + 0.5) | 0;
  //         pixels[yi + 1] = (gsum * div2 + 0.5) | 0;
  //         pixels[yi + 2] = (bsum * div2 + 0.5) | 0;
  //         pixels[yi + 3] = (asum * div2 + 0.5) | 0;

  //         if (x == 0) {
  //           vmin[y] = Math.min(y + rad1y, hm) * width;
  //           vmax[y] = Math.max(y - radius, 0) * width;
  //         }

  //         p1 = x + vmin[y];
  //         p2 = x + vmax[y];

  //         rsum += r[p1] - r[p2];
  //         gsum += g[p1] - g[p2];
  //         bsum += b[p1] - b[p2];
  //         asum += a[p1] - a[p2];

  //         yi += width << 2;
  //       }
  //     }
  //   }
  // }

  // // * opencv match one template
  // matchOneTemplate() {
  //   let src = cv.imread(this.snapshotCanvas.nativeElement);
  //   let src2 = cv.imread(this.snapshotCanvas.nativeElement);
  //   let dst = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC3);
  //   let template = cv.imread(this.dataMatrixTemplateImage.nativeElement);
  //   let M = new cv.Mat();

  //   // * 灰階
  //   cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY, 0);
  //   cv.cvtColor(template, template, cv.COLOR_RGBA2GRAY, 0);
  //   // * 閾值
  //   cv.threshold(
  //     src,
  //     src,
  //     this.thresHoldValue,
  //     255,
  //     this.enableInvertColor ? cv.THRESH_BINARY_INV : cv.THRESH_BINARY
  //   );

  //   // * 形態學
  //   M = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  //   cv.morphologyEx(src, src, cv.MORPH_OPEN, M);
  //   M = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  //   cv.morphologyEx(src, src, cv.MORPH_CLOSE, M);

  //   // * 樣板配對
  //   let mask = new cv.Mat();
  //   cv.matchTemplate(src, template, dst, cv.TM_CCOEFF, mask);
  //   let result = cv.minMaxLoc(dst, mask);
  //   let maxPoint = result.maxLoc;
  //   let color = new cv.Scalar(255, 0, 0, 255);

  //   let point = new cv.Point(
  //     maxPoint.x + template.cols,
  //     maxPoint.y + template.rows
  //   );
  //   cv.rectangle(src2, maxPoint, point, color, 2, cv.LINE_8, 0);

  //   // * 擷取barcode
  //   let rect = new cv.Rect(
  //     maxPoint.x,
  //     maxPoint.y,
  //     template.cols,
  //     template.rows
  //   );

  //   let area = src.roi(rect);
  //   let copyArea = area.clone();
  //   cv.copyMakeBorder(
  //     copyArea,
  //     copyArea,
  //     30,
  //     30,
  //     30,
  //     30,
  //     cv.BORDER_CONSTANT,
  //     new cv.Scalar(255, 255, 255, 255)
  //   );

  //   // * 顯示
  //   cv.imshow(this.snapshotCanvas.nativeElement, src2);
  //   cv.imshow(this.barcodeCanvas.nativeElement, copyArea);

  //   // * 釋放
  //   src.delete();
  //   src2.delete();
  //   dst.delete();
  //   M.delete();
  //   template.delete();
  //   mask.delete();
  //   area.delete();
  //   copyArea.delete();
  // }

  // // * opencv match multiple template
  // matchMultipleTemplate() {
  //   let src = cv.imread(this.snapshotCanvas.nativeElement);
  //   let templ = cv.imread(this.dataMatrixTemplateImage.nativeElement);
  //   let dst = new cv.Mat();
  //   let mask = new cv.Mat();

  //   cv.matchTemplate(src, templ, dst, cv.TM_CCOEFF_NORMED, mask);

  //   let color = new cv.Scalar(255, 0, 0, 255);

  //   var newDst = [];
  //   var start = 0;
  //   var end = dst.cols;

  //   var cnt = 0;
  //   outter: for (var i = 0; i < dst.rows; i++) {
  //     newDst[i] = [];
  //     for (var k = 0; k < dst.cols; k++) {
  //       newDst[i][k] = dst.data32F[start];

  //       if (newDst[i][k] > 0.97) {
  //         let maxPoint = {
  //           x: k,
  //           y: i,
  //         };
  //         let point = new cv.Point(k + templ.cols, i + templ.rows);
  //         cv.rectangle(src, maxPoint, point, color, 1, cv.LINE_8, 0);
  //         if (cnt == 0) console.log(newDst[i][k]);
  //         if (++cnt > 10) break outter;
  //       }
  //       console.log(newDst[i][k]);
  //       start++;
  //     }
  //     start = end;
  //     end = end + dst.cols;
  //   }
  //   cv.imshow(this.barcodeCanvas.nativeElement, src);

  //   src.delete();
  //   templ.delete();
  //   dst.delete();
  //   mask.delete();
  // }

  // // * opencv contours
  // contours() {
  //   try {
  //     let src = cv.imread(this.snapshotCanvas.nativeElement);
  //     let src2 = cv.imread(this.snapshotCanvas.nativeElement);
  //     let dst = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC3);
  //     let M = new cv.Mat();
  //     let contours = new cv.MatVector();
  //     let hierarchy = new cv.Mat();

  //     // * 灰階
  //     cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY);

  //     // * 校色板
  //     // let blockSize = 32;
  //     // let average = cv.mean(src)[0];
  //     // let subRows = Math.ceil(src.rows / blockSize);
  //     // let subCols = Math.ceil(src.cols / blockSize);
  //     // let blockImage = new cv.Mat.zeros(subRows, subCols, cv.CV_32FC1);

  //     // for (let i = 0; i < subRows; i++) {
  //     //   for (let j = 0; j < subCols; j++) {
  //     //     let rowMin = i * blockSize;
  //     //     let rowMax = (i + 1) * blockSize;
  //     //     let colMin = j * blockSize;
  //     //     let colMax = (j + 1) * blockSize;
  //     //     if (rowMax > src.rows) rowMax = src.rows;
  //     //     if (colMax > src.cols) colMax = src.cols;

  //     //     let rect = new cv.Rect(
  //     //       colMin,
  //     //       rowMin,
  //     //       colMax - colMin,
  //     //       rowMax - rowMin
  //     //     );
  //     //     let roi = new cv.Mat();
  //     //     roi = src.roi(rect);
  //     //     let temaver = cv.mean(roi)[0];
  //     //     blockImage.floatPtr(i, j)[0] = temaver;
  //     //     roi.delete();
  //     //   }
  //     // }

  //     // for (let i = 0; i < subRows; i++) {
  //     //   for (let j = 0; j < subCols; j++) {
  //     //     blockImage.floatPtr(i, j)[0] -= average;
  //     //   }
  //     // }

  //     // let tempResult = new cv.Mat();
  //     // let blockImage2 = new cv.Mat();
  //     // let tempSrc = new cv.Mat();
  //     // cv.resize(blockImage, blockImage2, src.size(), 0, 0, cv.INTER_CUBIC);
  //     // src.convertTo(tempSrc, cv.CV_32FC1);
  //     // cv.subtract(tempSrc, blockImage2, tempResult);
  //     // tempResult.convertTo(src, cv.CV_8UC1);

  //     // tempSrc.delete();
  //     // blockImage.delete();
  //     // blockImage2.delete();
  //     // tempResult.delete();

  //     // cv.imshow(this.snapshotCanvas2.nativeElement, src);

  //     // * 生成棋盤格
  //     // for (let i = 0; i < src2.rows; i++) {
  //     //   for (let j = 0; j < src2.cols; j++) {
  //     //     if ((Math.floor(i / 50) + Math.floor(j / 50)) % 2) {
  //     //       // src2.ucharPtr(i, j)[0] = 255;
  //     //       // src2.ucharPtr(i, j)[1] = 255;
  //     //       // src2.ucharPtr(i, j)[2] = 255;
  //     //       // src2.ucharPtr(i, j)[3] = 50;
  //     //     } else {
  //     //       // src2.ucharPtr(i, j)[0] = 0;
  //     //       // src2.ucharPtr(i, j)[1] = 0;
  //     //       // src2.ucharPtr(i, j)[2] = 0;
  //     //       // src2.ucharPtr(i, j)[3] = 255;
  //     //     }
  //     //   }
  //     // }

  //     // * 一般二值化
  //     // let grayRGBA = src.clone();
  //     // cv.cvtColor(grayRGBA, grayRGBA, cv.COLOR_GRAY2RGBA);
  //     // let imageData = new ImageData(
  //     //   new Uint8ClampedArray(grayRGBA.data),
  //     //   grayRGBA.cols,
  //     //   grayRGBA.rows
  //     // );
  //     // grayRGBA.delete();

  //     // if (this.enableThreshold) {
  //     //   // this.areaThreshold(imageData, 200, 200);
  //     //   this.OTSU(imageData.data, imageData.width * imageData.height);
  //     // }
  //     // src = cv.matFromImageData(imageData);
  //     // cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY);
  //     // cv.threshold(
  //     //   src,
  //     //   src,
  //     //   this.thresHoldValue,
  //     //   255,
  //     //   cv.THRESH_OTSU +
  //     //     (this.enableInvertColor ? cv.THRESH_BINARY_INV : cv.THRESH_BINARY)
  //     // );

  //     // * 區域二值化
  //     // const BLOCK_SIZE = src.rows / 8;
  //     // let subHeight = Math.floor(src.rows / BLOCK_SIZE);
  //     // let subWidth = Math.floor(src.cols / BLOCK_SIZE);
  //     // for (let i = 0; i < subHeight; i++) {
  //     //   for (let j = 0; j < subWidth; j++) {
  //     //     let r = new cv.Mat();
  //     //     let t = new cv.Rect(
  //     //       j * BLOCK_SIZE,
  //     //       i * BLOCK_SIZE,
  //     //       BLOCK_SIZE,
  //     //       BLOCK_SIZE
  //     //     );
  //     //     r = src.roi(t);
  //     //     cv.threshold(
  //     //       r,
  //     //       r,
  //     //       this.thresHoldValue,
  //     //       255,
  //     //       cv.THRESH_OTSU +
  //     //         (this.enableInvertColor ? cv.THRESH_BINARY_INV : cv.THRESH_BINARY)
  //     //     );
  //     //     r.delete();
  //     //   }
  //     // }

  //     // * ADAPTIVE_THRESH_GAUSSIAN_C
  //     cv.adaptiveThreshold(
  //       src,
  //       src,
  //       this.thresHoldValue || 255,
  //       cv.ADAPTIVE_THRESH_GAUSSIAN_C,
  //       this.enableInvertColor ? cv.THRESH_BINARY_INV : cv.THRESH_BINARY,
  //       321,
  //       3
  //     );
  //     // cv.threshold(
  //     //   src,
  //     //   src,
  //     //   this.thresHoldValue,
  //     //   255,
  //     //   (this.enableInvertColor ? cv.THRESH_BINARY_INV : cv.THRESH_BINARY) +
  //     //     cv.THRESH_OTSU
  //     //   // cv.THRESH_TRIANGLE
  //     //   // this.enableInvertColor ? cv.THRESH_BINARY_INV : cv.THRESH_BINARY
  //     // );

  //     // * 形態學
  //     M = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  //     cv.morphologyEx(src, src, cv.MORPH_OPEN, M);
  //     M = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  //     cv.morphologyEx(src, src, cv.MORPH_CLOSE, M);
  //     // M = cv.Mat.ones(6, 6, cv.CV_8U);
  //     // cv.erode(
  //     //   src,
  //     //   src,
  //     //   M,
  //     //   new cv.Point(-1, -1),
  //     //   1,
  //     //   cv.BORDER_CONSTANT,
  //     //   cv.morphologyDefaultBorderValue()
  //     // );

  //     // * 模糊
  //     // cv.GaussianBlur(src, src, new cv.Size(9, 9), 0, 0, cv.BORDER_DEFAULT);
  //     // cv.bilateralFilter(src, src, 9, 75, 75, cv.BORDER_DEFAULT);

  //     // * 輪廓偵測
  //     cv.findContours(
  //       src,
  //       contours,
  //       hierarchy,
  //       cv.RETR_EXTERNAL,
  //       cv.CHAIN_APPROX_SIMPLE
  //     );

  //     // * 畫輪廓
  //     // for (let i = 0; i < contours.size(); ++i) {
  //     //   let color = new cv.Scalar(255, 255, 255);
  //     //   cv.drawContours(dst, contours, i, color, 1, 8, hierarchy, 100);
  //     // }

  //     // * 邊界矩型
  //     let result = new cv.Mat();
  //     let maxIndex = null;
  //     for (let i = 0; i < contours.size(); ++i) {
  //       let cnt = contours.get(i);
  //       let rect = cv.boundingRect(cnt);
  //       let color = new cv.Scalar(255, 0, 0, 255);
  //       let point1 = new cv.Point(rect.x, rect.y);
  //       let point2 = new cv.Point(rect.x + rect.width, rect.y + rect.height);

  //       let maxRect = this.getRectInfo(contours, maxIndex || 0);
  //       let currRect = this.getRectInfo(contours, i);

  //       if (
  //         currRect.rectArea > 10000 &&
  //         currRect.aspectRatio > 0.9 &&
  //         // currRect.extent > 0.3 &&
  //         currRect.rectArea > maxRect.rectArea // 找最大面積
  //       ) {
  //         maxIndex = i;
  //       }

  //       cv.rectangle(src2, point1, point2, color, 2, cv.LINE_AA, 0);
  //       cnt.delete();
  //     }

  //     // * 擷取和畫出目標矩形
  //     if (maxIndex) {
  //       let maxRect = this.getRectInfo(contours, maxIndex);
  //       let color = new cv.Scalar(255, 255, 0, 255);
  //       let point1 = new cv.Point(maxRect.rect.x, maxRect.rect.y);
  //       let point2 = new cv.Point(
  //         maxRect.rect.x + maxRect.rect.width,
  //         maxRect.rect.y + maxRect.rect.height
  //       );
  //       let roiRect = new cv.Mat();
  //       let r = new cv.Rect(
  //         maxRect.rect.x,
  //         maxRect.rect.y,
  //         maxRect.rect.width,
  //         maxRect.rect.height
  //       );
  //       roiRect = src.roi(r).clone();
  //       cv.threshold(
  //         roiRect,
  //         roiRect,
  //         this.thresHoldValue,
  //         255,
  //         cv.THRESH_BINARY_INV
  //       );
  //       cv.copyMakeBorder(
  //         roiRect,
  //         result,
  //         200,
  //         200,
  //         200,
  //         200,
  //         cv.BORDER_CONSTANT,
  //         new cv.Scalar(255, 255, 255, 255)
  //       );
  //       cv.rectangle(src2, point1, point2, color, 2, cv.LINE_AA, 0);
  //       roiRect.delete();
  //     }

  //     // * 顯示
  //     cv.imshow(this.snapshotCanvas.nativeElement, src2);
  //     cv.imshow(this.snapshotCanvas2.nativeElement, src);
  //     if (result.size().width && result.size().height) {
  //       cv.imshow(this.barcodeCanvas.nativeElement, result);
  //     }

  //     // * 釋放
  //     src.delete();
  //     src2.delete();
  //     dst.delete();
  //     M.delete();
  //     contours.delete();
  //     hierarchy.delete();
  //     result.delete();
  //   } catch (error) {
  //     console.log(error);
  //     throw error;
  //   }
  // }

  // getRectInfo(contours: any, i: number) {
  //   let cnt = contours.get(i);
  //   let rect = cv.boundingRect(cnt);
  //   let area = cv.contourArea(cnt, false);
  //   let rectArea = rect.width * rect.height; //矩形面積
  //   let extent = area / rectArea; // 輪廓面積占矩形面積比
  //   let aspectRatio =
  //     rect.height > rect.width
  //       ? rect.width / rect.height
  //       : rect.height / rect.width; // 長寬比
  //   // console.log(rect, rectArea, extent, aspectRatio);
  //   return { rect, rectArea, extent, aspectRatio };
  // }
}