function logMsg(prefix, msg, ...rest) { 
    if (msg?.type === 'audio' || msg?.type === 'audioData') return;
    console.log(prefix, msg, ...rest);
 }

 const createAudioMeter = (() => {
    const meterIntervals = new WeakMap();
    
    return function(audioContext, parentElement) {
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 32;
        const analyzerData = new Uint8Array(analyser.frequencyBinCount);
        
        const container = document.createElement('div');
        container.style.cssText = `
            display: flex;
            gap: 6px;
            justify-content: center;
            align-items: center;
            height: 160px;
            max-width: 400px;
        `;
        
        // Create 5 bar pairs (top and bottom)
        const bars = Array.from({length: 5}, () => {
            const barContainer = document.createElement('div');
            barContainer.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                height: 100%;
                justify-content: center;
            `;
            
            const topBar = document.createElement('div');
            const bottomBar = document.createElement('div');
            
            [topBar, bottomBar].forEach(bar => {
                bar.style.cssText = `
                    width: 8px;
                    background-color: white;
                    height: 2px;
                    border-radius: 4px;
                    transition: height 0.05s;
                    transform-origin: bottom;
                `;
            });
            
            // Set specific transform origin for top bar
            topBar.style.transformOrigin = 'bottom';
            bottomBar.style.transformOrigin = 'top';
            
            barContainer.appendChild(topBar);
            barContainer.appendChild(bottomBar);
            container.appendChild(barContainer);
            return {top: topBar, bottom: bottomBar};
        });
        
        parentElement.appendChild(container);
        
        function updateBars() {
            analyser.getByteFrequencyData(analyzerData);
            const level = analyzerData.slice(0, 3).reduce((a, b) => a + b, 0) / (5 * 255);
                
            bars.forEach((bar, i) => {
                const distance = Math.abs(i - 2);
                const scale = 1 - (distance / 5);
                const height = Math.min(30, (level * scale * 60));
                bar.top.style.height = height + 'px';
                bar.bottom.style.height = height + 'px';
            });
        }
        
        const intervalId = setInterval(updateBars, 50);
        meterIntervals.set(container, intervalId);
        
        return analyser;
    }
})();