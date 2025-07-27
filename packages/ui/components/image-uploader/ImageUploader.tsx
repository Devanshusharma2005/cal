"use client";

import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";

import checkIfItFallbackImage from "@calcom/lib/checkIfItFallbackImage";
import { useLocale } from "@calcom/lib/hooks/useLocale";

import type { ButtonColor, ButtonProps } from "../button";
import { Button } from "../button";
import { Dialog, DialogClose, DialogContent, DialogTrigger, DialogFooter } from "../dialog";
import { showToast } from "../toast";
import { useFileReader, createImage, Slider } from "./Common";
import type { FileEvent, Area } from "./Common";

const MAX_IMAGE_SIZE = 512;

type ImageUploaderProps = {
  id: string;
  buttonMsg: string;
  buttonSize?: ButtonProps["size"];
  handleAvatarChange: (imageSrc: string) => void;
  imageSrc?: string;
  target: string;
  triggerButtonColor?: ButtonColor;
  uploadInstruction?: string;
  disabled?: boolean;
  testId?: string;
};

// This is separate to prevent loading the component until file upload
function CropContainer({
  onCropComplete,
  imageSrc,
}: {
  imageSrc: string;
  onCropComplete: (croppedAreaPixels: Area) => void;
}) {
  const { t } = useLocale();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const handleZoomSliderChange = (value: number) => {
    value < 1 ? setZoom(1) : setZoom(value);
  };

  return (
    <div className="crop-container h-40 max-h-40 w-40 rounded-full">
      <div className="relative h-40 w-40 rounded-full">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          onCropChange={setCrop}
          onCropComplete={(croppedArea, croppedAreaPixels) => onCropComplete(croppedAreaPixels)}
          onZoomChange={setZoom}
        />
      </div>
      <Slider
        value={zoom}
        min={1}
        max={3}
        step={0.1}
        label={t("slide_zoom_drag_instructions")}
        changeHandler={handleZoomSliderChange}
      />
    </div>
  );
}

export default function ImageUploader({
  target,
  id,
  buttonMsg,
  handleAvatarChange,
  triggerButtonColor,
  imageSrc,
  uploadInstruction,
  disabled = false,
  testId,
  buttonSize,
}: ImageUploaderProps) {
  const { t } = useLocale();
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const [{ result }, setFile] = useFileReader({
    method: "readAsDataURL",
  });

  const onInputFile = (e: FileEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) {
      return;
    }

    const limit = 5 * 1000000; // max limit 5mb
    const file = e.target.files[0];

    // File size validation
    if (file.size > limit) {
      showToast(t("image_size_limit_exceed"), "error");
      return;
    }

    // MIME type validation - check declared MIME type
    const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];

    if (!allowedMimeTypes.includes(file.type.toLowerCase())) {
      showToast(t("invalid_file_type"), "error");
      return;
    }

    // File content validation - check file magic bytes
    const validateFileContent = (file: File): Promise<boolean> => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const uint8Array = new Uint8Array(arrayBuffer.slice(0, 12)); // Check first 12 bytes

          // First, explicitly check for PDF files (security vulnerability vector)
          if (
            uint8Array.length >= 4 &&
            uint8Array[0] === 0x25 &&
            uint8Array[1] === 0x50 &&
            uint8Array[2] === 0x44 &&
            uint8Array[3] === 0x46
          ) {
            resolve(false); // PDF detected - reject
            return;
          }

          // Magic bytes for allowed image formats
          const magicBytes = {
            png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
            jpeg: [0xff, 0xd8, 0xff],
            gif87a: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
            gif89a: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
            webp: [0x52, 0x49, 0x46, 0x46], // RIFF header (WebP also has WEBP at bytes 8-11)
          };

          // Check PNG
          if (uint8Array.length >= 8 && magicBytes.png.every((byte, index) => uint8Array[index] === byte)) {
            resolve(true);
            return;
          }

          // Check JPEG
          if (uint8Array.length >= 3 && magicBytes.jpeg.every((byte, index) => uint8Array[index] === byte)) {
            resolve(true);
            return;
          }

          // Check GIF 87a
          if (
            uint8Array.length >= 6 &&
            magicBytes.gif87a.every((byte, index) => uint8Array[index] === byte)
          ) {
            resolve(true);
            return;
          }

          // Check GIF 89a
          if (
            uint8Array.length >= 6 &&
            magicBytes.gif89a.every((byte, index) => uint8Array[index] === byte)
          ) {
            resolve(true);
            return;
          }

          // Check WebP (RIFF header + WEBP signature)
          if (
            uint8Array.length >= 12 &&
            magicBytes.webp.every((byte, index) => uint8Array[index] === byte) &&
            uint8Array[8] === 0x57 &&
            uint8Array[9] === 0x45 &&
            uint8Array[10] === 0x42 &&
            uint8Array[11] === 0x50
          ) {
            resolve(true);
            return;
          }

          resolve(false);
        };
        reader.onerror = () => resolve(false);
        reader.readAsArrayBuffer(file.slice(0, 12));
      });
    };

    // Validate file content asynchronously
    validateFileContent(file).then((isValid) => {
      if (!isValid) {
        showToast(t("only_image_files_are_permitted"), "error");
        return;
      }
      setFile(file);
    });
  };

  const showCroppedImage = useCallback(
    async (croppedAreaPixels: Area | null) => {
      try {
        if (!croppedAreaPixels) return;
        const croppedImage = await getCroppedImg(
          result as string /* result is always string when using readAsDataUrl */,
          croppedAreaPixels
        );
        handleAvatarChange(croppedImage);
      } catch (e) {
        console.error(e);
      }
    },
    [result, handleAvatarChange]
  );

  return (
    <Dialog
      onOpenChange={(opened) => {
        // unset file on close
        if (!opened) {
          setFile(null);
        }
      }}>
      <DialogTrigger asChild>
        <Button
          color={triggerButtonColor ?? "secondary"}
          type="button"
          disabled={disabled}
          size={buttonSize}
          data-testid={testId ? `open-upload-${testId}-dialog` : "open-upload-avatar-dialog"}
          className="cursor-pointer py-1 text-sm">
          {buttonMsg}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("upload_target", { target })}>
        <div className="mb-4">
          <div className="cropper mt-6 flex flex-col items-center justify-center p-8">
            {!result && (
              <div className="bg-muted flex h-20 max-h-20 w-20 items-center justify-start rounded-full">
                {!imageSrc || checkIfItFallbackImage(imageSrc) ? (
                  <p className="text-emphasis w-full text-center text-sm sm:text-xs">
                    {t("no_target", { target })}
                  </p>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="h-20 w-20 rounded-full" src={imageSrc} alt={target} />
                )}
              </div>
            )}
            {result && <CropContainer imageSrc={result as string} onCropComplete={setCroppedAreaPixels} />}
            <label
              data-testid={testId ? `open-upload-${testId}-filechooser` : "open-upload-image-filechooser"}
              className="bg-subtle hover:bg-muted hover:text-emphasis border-subtle text-default mt-8 cursor-pointer rounded-sm border px-3 py-1 text-xs font-medium leading-4 transition focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-1">
              <input
                onInput={onInputFile}
                type="file"
                name={id}
                placeholder={t("upload_image")}
                className="text-default pointer-events-none absolute mt-4 opacity-0 "
                accept="image/*"
              />
              {t("choose_a_file")}
            </label>
            {uploadInstruction && (
              <p className="text-muted mt-4 text-center text-sm">({uploadInstruction})</p>
            )}
          </div>
        </div>
        <DialogFooter className="relative">
          <DialogClose color="minimal">{t("cancel")}</DialogClose>
          <DialogClose
            data-testid={testId ? `upload-${testId}` : "upload-avatar"}
            color="primary"
            onClick={() => showCroppedImage(croppedAreaPixels)}>
            {t("save")}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<string> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Context is null, this should never happen.");

  // Detect original image format from data URL
  const originalFormat =
    imageSrc.startsWith("data:image/jpeg") || imageSrc.startsWith("data:image/jpg")
      ? "image/jpeg"
      : "image/png";

  const maxSize = Math.max(image.naturalWidth, image.naturalHeight);
  const resizeRatio = MAX_IMAGE_SIZE / maxSize < 1 ? Math.max(MAX_IMAGE_SIZE / maxSize, 0.75) : 1;

  // huh, what? - Having this turned off actually improves image quality as otherwise anti-aliasing is applied
  // this reduces the quality of the image overall because it anti-aliases the existing, copied image; blur results
  ctx.imageSmoothingEnabled = false;
  // pixelCrop is always 1:1 - width = height
  canvas.width = canvas.height = Math.min(maxSize * resizeRatio, pixelCrop.width);

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  // on very low ratios, the quality of the resize becomes awful. For this reason the resizeRatio is limited to 0.75
  if (resizeRatio <= 0.75) {
    // With a smaller image, thus improved ratio. Keep doing this until the resizeRatio > 0.75.
    return getCroppedImg(canvas.toDataURL(originalFormat), {
      width: canvas.width,
      height: canvas.height,
      x: 0,
      y: 0,
    });
  }

  // Use original format with quality setting for JPEG
  return canvas.toDataURL(originalFormat, originalFormat === "image/jpeg" ? 0.9 : undefined);
}
