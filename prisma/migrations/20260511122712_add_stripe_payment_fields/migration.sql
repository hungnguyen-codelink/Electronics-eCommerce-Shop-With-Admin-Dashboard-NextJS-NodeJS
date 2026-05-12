-- AlterTable
ALTER TABLE `Customer_order` ADD COLUMN `paymentStatus` ENUM('unpaid', 'paid', 'failed', 'expired') NOT NULL DEFAULT 'unpaid',
ADD COLUMN `stripeSessionId` VARCHAR(191),
ADD COLUMN `stripePaymentIntentId` VARCHAR(191),
ADD COLUMN `paidAt` DATETIME(3),
ADD COLUMN `checkoutAttempts` INT NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX `Customer_order_stripeSessionId_key` ON `Customer_order`(`stripeSessionId`);

-- CreateIndex
CREATE UNIQUE INDEX `Customer_order_stripePaymentIntentId_key` ON `Customer_order`(`stripePaymentIntentId`);
