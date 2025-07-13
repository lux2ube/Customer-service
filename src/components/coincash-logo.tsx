import Image from 'next/image';

export function CoinCashLogo() {
  return (
    <Image 
      src="https://ycoincash.com/wp-content/uploads/2024/10/cropped-20240215_022836-150x150.jpg"
      alt="Coin Cash Logo"
      width={40}
      height={40}
      className="h-10 w-10 rounded-full object-cover"
    />
  );
}
