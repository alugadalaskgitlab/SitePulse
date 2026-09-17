export function useUpload() {
  return { uploadFile: async () => null, isUploading: false, error: null, progress: 0 };
}