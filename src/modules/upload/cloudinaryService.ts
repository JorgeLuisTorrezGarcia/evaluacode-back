import { v2 as cloudinary } from 'cloudinary';
import { config } from '../../config/env';

// Parsear URL de Cloudinary para obtener credenciales
const parseCloudinaryUrl = (url: string) => {
  try {
    const parsedUrl = new URL(url);
    return {
      cloud_name: parsedUrl.hostname,
      api_key: parsedUrl.username,
      api_secret: parsedUrl.password
    };
  } catch (error) {
    throw new Error('Invalid CLOUDINARY_URL format');
  }
};

// Configurar Cloudinary
const cloudinaryCredentials = parseCloudinaryUrl(config.CLOUDINARY_URL);
cloudinary.config({
  ...cloudinaryCredentials,
  secure: true
});

export class CloudinaryService {
  /**
   * Subir archivo a Cloudinary
   */
  static async uploadFile(
    fileBuffer: Buffer, 
    options: {
      folder?: string;
      publicId?: string;
      resourceType?: 'image' | 'video' | 'raw' | 'auto';
      transformation?: any;
      format?: string;
    } = {}
  ) {
    try {
      const {
        folder = 'evaluacode',
        publicId,
        resourceType = 'auto',
        transformation,
        format
      } = options;

      const uploadOptions: any = {
        folder,
        resource_type: resourceType,
        use_filename: true,
        unique_filename: !publicId,
      };

      if (publicId) {
        uploadOptions.public_id = publicId;
      }

      if (transformation) {
        uploadOptions.transformation = transformation;
      }

      if (format) {
        uploadOptions.format = format;
      }

      // Subir desde buffer
      return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          }
        ).end(fileBuffer);
      });
    } catch (error) {
      throw new Error(`Cloudinary upload failed: ${error}`);
    }
  }

  /**
   * Eliminar archivo de Cloudinary
   */
  static async deleteFile(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'image') {
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType
      });
      return result;
    } catch (error) {
      throw new Error(`Cloudinary delete failed: ${error}`);
    }
  }

  /**
   * Obtener detalles de archivo
   */
  static async getFileDetails(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'image') {
    try {
      const result = await cloudinary.api.resource(publicId, {
        resource_type: resourceType
      });
      return result;
    } catch (error) {
      throw new Error(`Cloudinary get details failed: ${error}`);
    }
  }

  /**
   * Listar archivos en una carpeta
   */
  static async listFiles(folder: string = 'evaluacode', maxResults: number = 50) {
    try {
      const result = await cloudinary.api.resources({
        type: 'upload',
        prefix: folder,
        max_results: maxResults
      });
      return result;
    } catch (error) {
      throw new Error(`Cloudinary list files failed: ${error}`);
    }
  }

  /**
   * Generar URL firmada para acceso temporal
   */
  static generateSignedUrl(publicId: string, options: any = {}) {
    try {
      const defaultOptions = {
        sign_url: true,
        expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hora
        ...options
      };

      return cloudinary.url(publicId, defaultOptions);
    } catch (error) {
      throw new Error(`Cloudinary signed URL generation failed: ${error}`);
    }
  }

  /**
   * Optimizar imagen automáticamente
   */
  static generateOptimizedUrl(publicId: string, options: any = {}) {
    const defaultOptions = {
      fetch_format: 'auto',
      quality: 'auto',
      ...options
    };

    return cloudinary.url(publicId, defaultOptions);
  }
}

export { cloudinary };
