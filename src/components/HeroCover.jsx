import Spline from '@splinetool/react-spline';

export default function HeroCover({ title, subtitle }) {
  return (
    <div className="relative h-full w-full">
      <Spline
        scene="https://prod.spline.design/44zrIZf-iQZhbQNQ/scene.splinecode"
        style={{ width: '100%', height: '100%' }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h1 className="text-balance bg-gradient-to-b from-white via-white to-white/60 bg-clip-text font-[700] leading-tight text-transparent" style={{ fontSize: 'clamp(28px, 6vw, 64px)' }}>
            {title}
          </h1>
          <p className="mt-4 text-balance text-white/80" style={{ fontSize: 'clamp(14px, 2.2vw, 18px)' }}>
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}
