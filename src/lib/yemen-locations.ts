export const yemenGovernoratesAndDistricts = {
  'عدن': ['عدن', 'الشيخ عثمان', 'خور مكسر', 'دار سعد', 'المنصورة', 'تولة', 'صيرة', 'المعلا'],
  'ذمار': ['ذمار', 'ريمة', 'آنس', 'العرش', 'حوث', 'يريم', 'كحلان'],
  'ديار الحجر': ['ديار الحجر'],
  'البحرة': ['البحرة'],
  'الضالع': ['الضالع', 'قعطبة', 'دمت', 'العزاني', 'جبن', 'مريمة'],
  'المهرة': ['الغيضة', 'الشحر', 'هصورة', 'ثمود'],
  'أبين': ['الشيخ عثمان', 'جنة', 'زنجبار', 'أرحب', 'شبام', 'ريدة', 'المخا'],
  'إب': ['إب', 'يافع', 'جبلة', 'الضحي', 'مدينة إب', 'التعزية', 'البقعة', 'الحسيمة'],
  'الحديدة': ['الحديدة', 'الخوخة', 'كوكبان', 'باجل', 'منيع', 'الدريهمي', 'بيت الفقيه', 'رس الارة'],
  'حجة': ['حجة', 'الجاهلي', 'الطور', 'الشيخ عثمان', 'أم لحوم', 'وادي ماور', 'أرحب', 'مجزر'],
  'حضرموت': ['المكلا', 'سيئون', 'شبوة', 'تريم', 'الشحر', 'بروم', 'دوعن', 'الميفعة', 'المسيلة', 'غيل باوزير'],
  'ريمة': ['ريمة', 'مران', 'الجعفرية', 'كتاف', 'قسم الحسن'],
  'شبوة': ['عتق', 'المسيلة', 'عسيلان', 'أرمة', 'نعيم', 'حجر'],
  'صنعاء': ['صنعاء', 'بني حشيش', 'سنحان', 'خراف', 'معين', 'الوصيع', 'عماد الدين', 'حزام', 'ظهرة الرياض', 'الرونة'],
  'صعدة': ['صعدة', 'كتاف', 'رازح', 'منبه', 'ساقين', 'ملحان', 'باقم'],
  'عمران': ['عمران', 'صخيف', 'كحلان الشرقية', 'كحلان الغربية', 'ولد الطويل'],
  'الجوف': ['الجوف', 'الحزم', 'برط', 'الشلعة', 'المتون'],
  'محافظة المهجر': ['المهجر'],
  'المحويت': ['المحويت', 'كوكبان', 'ملحان', 'دهب', 'شرس', 'وشاح'],
  'المحويت': ['المحويت', 'كوكبان'],
  'مأرب': ['مأرب', 'العبر', 'الجوبة', 'نجد'],
  'الربعي': ['الربعي'],
  'الريان': ['الريان'],
  'ريمة': ['ريمة'],
  'الشرقية': ['الشرقية'],
  'تعز': ['تعز', 'التعزية', 'الدريهمي', 'المعابر', 'مقبنة', 'المراس', 'الشمائل', 'موزع', 'ساحل تعز'],
  'الضالع': ['الضالع'],
};

export const yemenGovernorates = Object.keys(yemenGovernoratesAndDistricts);

export const allYemenDistricts = Object.values(yemenGovernoratesAndDistricts)
  .flat()
  .filter((value, index, self) => self.indexOf(value) === index);

export function normalizeYemenLocation(location: string): string {
  if (!location) return '';
  
  const normalized = location.trim();
  
  // Check if it matches a governorate
  for (const governorate of yemenGovernorates) {
    if (normalized.includes(governorate) || governorate.includes(normalized)) {
      return governorate;
    }
  }
  
  // Check if it matches a district
  for (const district of allYemenDistricts) {
    if (normalized === district || normalized.includes(district) || district.includes(normalized)) {
      return district;
    }
  }
  
  return normalized;
}

export function getGovernorateByDistrict(district: string): string | null {
  for (const [governorate, districts] of Object.entries(yemenGovernoratesAndDistricts)) {
    if (districts.includes(district)) {
      return governorate;
    }
  }
  return null;
}
