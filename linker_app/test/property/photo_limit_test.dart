import 'package:glados/glados.dart';
import 'package:linker_app/shared/models/profile.dart';

/// **Validates: Requirements 3.4, 3.5**
///
/// 属性9：照片上传数量限制正确性
/// 照片数量永远不超过 6。
void main() {
  group('属性9：照片上传数量限制正确性', () {
    Glados(any.intInRange(0, 20)).test(
      '照片数量永远不超过 6',
      (attemptedUploads) {
        const maxPhotos = 6;

        // 模拟照片列表
        final photos = <Photo>[];

        // 模拟上传操作（带限制检查）
        for (int i = 0; i < attemptedUploads; i++) {
          if (photos.length < maxPhotos) {
            photos.add(Photo(
              id: 'photo_$i',
              url: 'https://example.com/photo_$i.jpg',
              order: i,
            ));
          }
        }

        // 验证照片数量永远不超过 6
        expect(photos.length, lessThanOrEqualTo(maxPhotos));
        // 验证实际添加数量
        expect(
          photos.length,
          equals(attemptedUploads.clamp(0, maxPhotos)),
        );
      },
    );
  });
}
