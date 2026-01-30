interface DateInputProps {
  label: string;
  day: string;
  month: string;
  year: string;
  onDayChange: (value: string) => void;
  onMonthChange: (value: string) => void;
  onYearChange: (value: string) => void;
}

export default function DateInput({
  label,
  day,
  month,
  year,
  onDayChange,
  onMonthChange,
  onYearChange,
}: DateInputProps) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2 text-white">
        {label}
      </label>
      <div className="flex gap-2">
        <div className="flex-1">
          <input
            type="text"
            inputMode="numeric"
            placeholder="DD"
            value={day}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 2);
              onDayChange(value);
            }}
            className="w-full px-3 py-2 rounded-lg text-white text-center focus:outline-none"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            maxLength={2}
          />
        </div>
        <div className="flex items-center" style={{ color: '#666666' }}>.</div>
        <div className="flex-1">
          <input
            type="text"
            inputMode="numeric"
            placeholder="MM"
            value={month}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 2);
              onMonthChange(value);
            }}
            className="w-full px-3 py-2 rounded-lg text-white text-center focus:outline-none"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            maxLength={2}
          />
        </div>
        <div className="flex items-center" style={{ color: '#666666' }}>.</div>
        <div className="flex-[2]">
          <input
            type="text"
            inputMode="numeric"
            placeholder="YYYY"
            value={year}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 4);
              onYearChange(value);
            }}
            className="w-full px-3 py-2 rounded-lg text-white text-center focus:outline-none"
            style={{ backgroundColor: '#1a1a1a', border: '1px solid #2a2a2a' }}
            maxLength={4}
          />
        </div>
      </div>
    </div>
  );
}
